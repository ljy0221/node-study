import { prisma } from "./../db.js";
import { redis } from "./../redis.js";
import { HttpError } from "../middleware/errorHandler.js";
import { isUniqueViolation } from "./prismaError.js";
import type { IssueResult, IssueStrategy } from "./types.js";

// ============================================================
// Stage 4 심화: Redis + Lua 스크립트 전략  ← JS 통합은 직접 구현
// ============================================================
//
// 기존 redis 전략의 약점: DECR을 먼저 하고 음수면 INCR로 되돌린다.
//   → 품절 순간 수백 요청이 카운터를 음수로 내렸다가 되돌리는 낭비 + 잠깐의 음수 상태.
//
// Lua로 개선: "GET → 재고 있으면 DECR, 없으면 그냥 -1 반환"을 서버에서 원자적으로.
//   Redis는 Lua 스크립트 실행 중 다른 명령을 끼워넣지 않으므로(단일 스레드) 원자적.
//   → 애초에 음수로 내려가지 않는다. 품절 시 INCR 보정 불필요.
//
// 아래 STOCK_LUA 는 그대로 쓰면 됨(참고 제공). 반환값 규약:
//   -1  → 재고 없음(품절). DECR 안 했으므로 되돌릴 것 없음.
//   >=0 → 슬롯 확보 성공. (DECR 후의 남은 재고)
//
// KEYS[1] = stockKey. ioredis 호출: redis.eval(STOCK_LUA, 1, stockKey)
//   (숫자 1 = KEYS 개수). 반환 타입은 unknown이라 Number(...)로 변환해서 판정.
//
// 구현할 것 (issue 본문):
//   1) const res = Number(await redis.eval(STOCK_LUA, 1, stockKey));
//   2) res === -1 (또는 res < 0) → { ok:false, reason:'SOLD_OUT' }   // INCR 없음!
//   3) res >= 0 → DB 쿠폰 생성 + issuedCount 증가 → { ok:true, couponId }
//      - 중복(P2002)이면: 이 경로는 "실제로 DECR로 슬롯을 뺏은" 경우이므로
//        redis.incr(stockKey)로 슬롯 반납 후 { ok:false, reason:'ALREADY_ISSUED' }
//      - 그 외 에러는 isUniqueViolation로 걸러 rethrow
//
// 검증:
//   npm run seed
//   k6 run -e STRATEGY=redis-lua load/issue.k6.js
//   npm run count   → 100
//   redis GET campaign:demo-campaign:stock → 0 (품절 요청이 음수로 안 내려갔음)

const STOCK_LUA = `
local stock = tonumber(redis.call('GET', KEYS[1]))
if stock == nil then return -1 end
if stock <= 0 then return -1 end
return redis.call('DECR', KEYS[1])
`;

export const redisLuaStrategy: IssueStrategy = {
  name: "redis-lua",

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
    void STOCK_LUA;

    // TODO: 위 흐름을 참고해 직접 구현
    // throw new HttpError(501, 'redis-lua 전략 미구현 — 직접 작성하세요');

    const res = Number(await redis.eval(STOCK_LUA, 1, stockKey));

    if (res === -1) return { ok: false, reason: "SOLD_OUT" };

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
  },
};
