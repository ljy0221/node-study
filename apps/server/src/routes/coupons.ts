import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const couponsRouter = Router();

// GET /api/coupons/mine — 로그인 유저의 발급 이력 (보호됨)
// requireAuth가 먼저 돌아 req.user를 채운 뒤 이 핸들러가 실행된다.
//
// 흐름(직접 구현):
//   1) req.user!.id 로 내 userKey를 안다 (발급 시 userKey=유저 id로 저장하니까 — 2b에서 연결)
//   2) prisma.coupon.findMany({ where: { userKey: req.user!.id }, orderBy: { issuedAt: 'desc' } })
//   3) res.json({ coupons })
couponsRouter.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    // TODO: 내 쿠폰 목록 조회 후 응답
    // res.status(501).json({ error: 'coupons/mine 미구현 — 직접 작성하세요' });
    const coupons = await prisma.coupon.findMany({
      where: { userKey: req.user!.id },
      orderBy: { issuedAt: "desc" },
    });

    return res.json({ coupons });
  }),
);
