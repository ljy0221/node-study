import { prisma } from '../db.js';
import { HttpError } from '../middleware/errorHandler.js';
import { isUniqueViolation } from './prismaError.js';
import type { IssueResult, IssueStrategy } from './types.js';

// 비관적 락 전략 (SELECT ... FOR UPDATE).
// 트랜잭션 안에서 캠페인 행을 잠근 뒤 검사·증가한다. 다른 요청은 트랜잭션이
// 끝날 때까지 그 행에서 대기(직렬화)하므로 초과 발급이 불가능하다.
// ⚠️ 트랜잭션 콜백 안에서는 반드시 인자 `tx`를 사용한다(전역 prisma는 다른
//    커넥션이라 락과 무관해짐). create 실패 시 throw → 트랜잭션 자동 롤백.

export const pessimisticStrategy: IssueStrategy = {
  name: 'pessimistic',

  async issue(campaignId: string, userKey: string): Promise<IssueResult> {
    return prisma.$transaction(async (tx) => {
      // 1) 행 잠금 + 현재 재고 읽기 (tx 사용)
      const rows = await tx.$queryRaw<{ issuedCount: number; totalStock: number }[]>`
        SELECT "issuedCount", "totalStock" FROM "Campaign"
        WHERE "id" = ${campaignId}
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) throw new HttpError(404, 'Campaign not found');

      // 2) 검사 (락으로 보호됨)
      if (row.issuedCount >= row.totalStock) {
        return { ok: false, reason: 'SOLD_OUT' };
      }

      // 3) 쿠폰 생성 + 증가. create 실패 시 throw → 트랜잭션 롤백(수동 decrement 불필요)
      try {
        const coupon = await tx.coupon.create({
          data: { campaignId, userKey },
        });
        await tx.campaign.update({
          where: { id: campaignId },
          data: { issuedCount: { increment: 1 } },
        });
        return { ok: true, couponId: coupon.id };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        return { ok: false, reason: 'ALREADY_ISSUED' };
      }
    });
  },
};
