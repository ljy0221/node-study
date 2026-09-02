import { prisma } from "./../db.js";
import { redis } from "./../redis.js";
import { HttpError } from "../middleware/errorHandler.js";
import { isUniqueViolation } from "./prismaError.js";
import type { IssueResult, IssueStrategy } from "./types.js";

// ============================================================
// Stage 4: Redis 원자 카운터 전략  ← 직접 구현
// ============================================================
//
// 아이디어: 재고 카운터를 Redis에 두고 DECR로 원자적으로 선점한다.
//          Redis는 단일 스레드라 DECR가 원자적 → 여러 요청이 동시에 마지막 1개를
//          가져갈 수 없다. DB 락 없이 재고 게이트키핑을 Redis가 담당.
//
// 키: seed가 넣어둔 것과 반드시 동일해야 함 → `campaign:${campaignId}:stock`
//     (seed.ts에서 SET campaign:demo-campaign:stock 100)
//
// 핵심 흐름:
//   1) const remaining = await redis.decr(stockKey);
//        - DECR는 감소 "후"의 값을 반환한다.
//        - remaining >= 0  → 슬롯 확보 성공 (재고 남아있었음)
//        - remaining <  0  → 품절. 단, 너무 음수로 내려가지 않게 INCR로 되돌려준다.
//   2) 슬롯 확보 시 → DB에 쿠폰 생성 (+ campaign.issuedCount 증가시켜 DB도 일치시킴)
//   3) 쿠폰 생성이 unique 위반(P2002)이면 = 이미 발급 →
//        확보했던 슬롯을 redis.incr로 되돌리고 ALREADY_ISSUED
//        (다른 에러면 isUniqueViolation로 걸러 rethrow — 다른 전략과 동일)
//
// 왜 issuedCount도 올리나?
//   redis가 재고의 실질 truth지만, npm run count가 issuedCount==쿠폰수를 대조하므로
//   DB의 issuedCount도 맞춰준다(다른 전략과 동일한 검증이 통하게).
//
// 심화(선택): DECR 후 음수 보정이 신경 쓰이면, GET→검사→DECR을 Lua 스크립트 하나로
//            원자화해 애초에 음수로 안 내려가게 할 수 있다. (redis.eval)
//
// 검증:
//   npm run seed      (redis 키도 100으로 초기화됨)
//   k6 run -e STRATEGY=redis load/issue.k6.js
//   npm run count     → 정확히 100

export const redisStrategy: IssueStrategy = {
  name: "redis",

  async issue(campaignId: string, userKey: string): Promise<IssueResult> {
    const exists = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });
    if (!exists) throw new HttpError(404, "Campaign not found");

    const stockKey = `campaign:${campaignId}:stock`;
    void redis;
    void isUniqueViolation;
    void userKey;
    void stockKey;

    // TODO: 위 흐름을 참고해 직접 구현
    //throw new HttpError(501, 'redis 전략 미구현 — 직접 작성하세요');

    const remaining = await redis.decr(stockKey);

    if (remaining >= 0) {
      try {
        const coupon = await prisma.coupon.create({
          data: { campaignId, userKey },
        });
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { issuedCount: { increment: 1 } },
        });
        return { ok: true, couponId: coupon.id };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        await redis.incr(stockKey);
        return { ok: false, reason: "ALREADY_ISSUED" };
      }
    } else {
      await redis.incr(stockKey);
      return { ok: false, reason: "SOLD_OUT" };
    }
  },
};
