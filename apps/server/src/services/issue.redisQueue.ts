import { prisma } from "./../db.js";
import { redis } from "./../redis.js";
import { HttpError } from "../middleware/errorHandler.js";
import type { IssueResult, IssueStrategy } from "./types.js";

// ============================================================
// Stage 4 심화: 비동기 발급 큐 (요청 측)  ← enqueue를 직접 구현
// ============================================================
//
// 요청은 "슬롯 선점 + 큐에 작업 넣기"까지만 하고 즉시 응답한다(202).
// 실제 DB 쿠폰 생성은 worker.ts가 큐에서 꺼내 처리한다(최종 일관성).
//
// 흐름:
//   1) Lua로 재고 슬롯을 원자적으로 선점 (redis-lua와 동일한 스크립트).
//      res === -1 → 품절(SOLD_OUT). res >= 0 → 선점 성공.
//   2) 선점 성공 시 → 발급 작업을 큐에 넣는다:
//        await redis.lpush(QUEUE_KEY, JSON.stringify({ campaignId, userKey }))
//      그리고 { ok: true, queued: true } 반환 (couponId는 아직 없음).
//
// ⚠️ 여기선 DB를 건드리지 않는다. 그게 이 전략의 핵심(요청 경로에서 DB 제거).
// ⚠️ QUEUE_KEY 는 worker.ts와 반드시 동일해야 한다: 'issue-queue'

const STOCK_LUA = `
local stock = tonumber(redis.call('GET', KEYS[1]))
if stock == nil then return -1 end
if stock <= 0 then return -1 end
return redis.call('DECR', KEYS[1])
`;

const QUEUE_KEY = "issue-queue";

export const redisQueueStrategy: IssueStrategy = {
  name: "redis-queue",

  async issue(campaignId: string, userKey: string): Promise<IssueResult> {
    const exists = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });
    if (!exists) throw new HttpError(404, "Campaign not found");

    const stockKey = `campaign:${campaignId}:stock`;
    void redis;
    void STOCK_LUA;
    void QUEUE_KEY;
    void userKey;
    void stockKey;

    // TODO: 1) Lua로 슬롯 선점  2) LPUSH로 큐에 넣고 { ok:true, queued:true } 반환
    // throw new HttpError(501, 'redis-queue 전략 미구현 — 직접 작성하세요');
    const res = Number(await redis.eval(STOCK_LUA, 1, stockKey));

    if (res === -1) return { ok: false, reason: "SOLD_OUT" };

    await redis.lpush(QUEUE_KEY, JSON.stringify({ campaignId, userKey }));
    return { ok: true, queued: true };
  },
};
