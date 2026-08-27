import { prisma } from "../db.js";
import { HttpError } from "../middleware/errorHandler.js";
import { isUniqueViolation } from "./prismaError.js";
import type { IssueResult, IssueStrategy } from "./types.js";

// 낙관적 락 전략 (version 컬럼 + 재시도).
// 락을 걸지 않고, 읽은 version을 조건에 넣어 조건부 UPDATE한다. 그 사이 version이
// 바뀌었으면(영향 행 0) 경합이므로 다시 읽고 재시도한다.
// 조건이 "version = 상수"라 raw SQL 없이 Prisma updateMany로 표현 가능(atomic과 대비).
// 경합이 극심한 선착순에선 재시도가 폭증해 처리량이 급락한다(벤치 참고).

const MAX_RETRY = 50;

export const optimisticStrategy: IssueStrategy = {
  name: "optimistic",

  async issue(campaignId: string, userKey: string): Promise<IssueResult> {
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (!c) throw new HttpError(404, "Campaign not found");
      if (c.issuedCount >= c.totalStock)
        return { ok: false, reason: "SOLD_OUT" };

      const r = await prisma.campaign.updateMany({
        where: { id: campaignId, version: c.version },
        data: { issuedCount: { increment: 1 }, version: { increment: 1 } },
      });

      if (r.count === 0) continue;
      
      try {
        const coupon = await prisma.coupon.create({
          data: { campaignId, userKey },
        });
        return { ok: true, couponId: coupon.id };
      } catch (error) {
        // 중복 발급(unique 위반) → 위 updateMany로 이미 올린 issuedCount +1을 되돌린다.
        // ⚠️ 교훈: 롤백은 id로만 찾고 issuedCount만 -1 한다.
        //   - version 조건(version: c.version)으로 찾으면 안 됨:
        //     updateMany가 version을 c.version→c.version+1로 이미 올려놔서,
        //     옛 version으로는 행을 못 찾아 P2025(Record to update not found)로 또 터진다.
        //   - version은 decrement 하면 안 됨: version은 "바뀌었다"는 신호라 앞으로만 가야 한다.
        //     되돌리면 동시에 그 version을 읽은 다른 요청의 CAS 판정이 꼬인다.
        await prisma.campaign.update({
          where: {id: campaignId},
          data: {issuedCount: {decrement: 1}},
        });

        if (!isUniqueViolation(error)) throw error;

        return { ok: false, reason: 'ALREADY_ISSUED' };
      }
    }

    return {ok: false, reason: 'RETRY_EXHAUSTED'};
  },
};
