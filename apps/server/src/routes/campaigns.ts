import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError, asyncHandler } from "../middleware/errorHandler.js";
import { getStrategy } from "../services/registry.js";
import {
  optionalAuth,
  requireAdmin,
  requireAuth,
} from "../middleware/requireAuth.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const campaignsRouter = Router();

// ── Stage 1: 캠페인 CRUD ──

// GET /api/campaigns — 목록 (공개)
// 흐름(직접 구현):
//   prisma.campaign.findMany({ orderBy: { createdAt: "desc" } })
//   → 각 항목에 remaining(= totalStock - issuedCount) 붙여서 res.json({ campaigns })
campaignsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({
      campaigns: campaigns.map((c) => ({
        ...c,
        remaining: c.totalStock - c.issuedCount,
      })),
    });
  }),
);

const createCampaignBody = z.object({
  name: z.string().min(1),
  totalStock: z.number().int().positive(),
});

// POST /api/campaigns — 생성 (관리자만)
// requireAuth(로그인?) → requireAdmin(관리자?) 통과해야 핸들러 실행.
// 흐름(직접 구현):
//   1) const { name, totalStock } = createCampaignBody.parse(req.body)
//   2) const campaign = await prisma.campaign.create({ data: { name, totalStock } })
//   3) res.status(201).json(campaign)
campaignsRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { name, totalStock } = createCampaignBody.parse(req.body);
    const campaign = await prisma.campaign.create({
      data: { name, totalStock },
    });
    res.status(201).json(campaign);
  }),
);

// 캠페인 단건 조회 (남은 재고 확인용)
campaignsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
    });
    if (!campaign) {
      throw new HttpError(404, "Campaign not found");
    }
    res.json({
      ...campaign,
      remaining: campaign.totalStock - campaign.issuedCount,
    });
  }),
);

const issueBody = z.object({
  // Stage 5 이전에는 클라이언트/부하테스트가 userKey를 직접 전달한다.
  userKey: z.string().min(1).optional(),
});
const issueQuery = z.object({
  strategy: z.string().optional(),
});

// 쿠폰 발급 — 이 프로젝트의 심장.
// ?strategy= 로 전략을 골라 같은 조건에서 동시성 거동을 비교한다.
campaignsRouter.post(
  "/:id/issue",
  rateLimit({keyPrefix: "issue", limit: 30, windowSec: 60}),
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = issueBody.parse(req.body);
    const { strategy } = issueQuery.parse(req.query);

    const userKey = req.user?.id ?? body.userKey;
    if (!userKey)
      throw new HttpError(
        400,
        "userKey가 필요합니다 (로그인 또는 body.userKey)",
      );

    const result = await getStrategy(strategy).issue(req.params.id, userKey);

    if (!result.ok) {
      const statusByReason = {
        ALREADY_ISSUED: 409,
        SOLD_OUT: 410,
        RETRY_EXHAUSTED: 429,
      } as const;

      const status = statusByReason[result.reason!] ?? 410;
      res.status(status).json({ ok: false, reason: result.reason });
      return;
    }
    // 큐 전략: 슬롯 선점만 완료, 실제 발급은 워커가 처리 → 202 Accepted
    if (result.queued) {
      res.status(202).json({ ok: true, queued: true });
      return;
    }
    res.status(201).json(result);
  }),
);
