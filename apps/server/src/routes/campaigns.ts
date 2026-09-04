import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError, asyncHandler } from "../middleware/errorHandler.js";
import { getStrategy } from "../services/registry.js";
import { optionalAuth } from "../middleware/requireAuth.js";

export const campaignsRouter = Router();

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
