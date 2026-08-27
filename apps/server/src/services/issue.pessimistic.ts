import { prisma } from '../db.js';
import { HttpError } from '../middleware/errorHandler.js';
import type { IssueResult, IssueStrategy } from './types.js';

// ============================================================
// Stage 3 실습 ②: 비관적 락 (SELECT ... FOR UPDATE)  ← 직접 구현
// ============================================================
//
// 아이디어: 트랜잭션 안에서 캠페인 행을 FOR UPDATE 로 잠근 뒤,
//          재고를 검사하고 증가시킨다. 잠금 덕분에 다른 요청은
//          내 트랜잭션이 끝날 때까지 그 행을 못 건드리고 대기한다.
//
// ⚠️ 가장 중요한 포인트 (여기서 자주 틀림):
//   트랜잭션 콜백 안에서는 반드시 인자로 받은 `tx` 를 써야 한다.
//   전역 `prisma` 를 쓰면 다른 커넥션이라 락과 무관해져서 의미가 없어진다.
//   → SELECT FOR UPDATE, update, coupon.create 전부 `tx.xxx` 로!
//
// 구현 뼈대:
//   return prisma.$transaction(async (tx) => {
//     // 1) 행 잠금 + 현재 재고 읽기 (raw SQL, tx 사용)
//     const rows = await tx.$queryRaw<{ issuedCount: number; totalStock: number }[]>`
//       SELECT "issuedCount", "totalStock" FROM "Campaign"
//       WHERE "id" = ${campaignId}
//       FOR UPDATE
//     `;
//     const row = rows[0];
//     if (!row) throw new HttpError(404, 'Campaign not found');
//
//     // 2) 재고 검사 (이제 이 검사~증가는 락으로 보호됨)
//     if (row.issuedCount >= row.totalStock) return { ok:false, reason:'SOLD_OUT' };
//
//     // 3) 증가 + 쿠폰 생성 (tx 사용). unique 위반 시 ALREADY_ISSUED
//     //    - 트랜잭션 안에서 throw 하면 자동 롤백되므로, atomic처럼 수동 decrement 불필요.
//     //      단, ALREADY_ISSUED 를 "정상 결과"로 돌려주려면 create 를 try/catch 로 감싸고
//     //      롤백시키지 말지(=결과 반환) 정할 것. (힌트: 증가와 생성을 한 트랜잭션에 두면,
//     //       create 실패 시 throw → 증가도 롤백됨 → 깔끔)
//   });
//
// $queryRaw 제네릭: 반환 행 타입을 <T[]> 로 지정하면 결과에 타입이 붙는다.
//
// 검증:
//   npm run seed
//   k6 run -e STRATEGY=pessimistic load/issue.k6.js
//   npm run count        → 정확히 100 이어야 함

export const pessimisticStrategy: IssueStrategy = {
  name: 'pessimistic',

  async issue(campaignId: string, userKey: string): Promise<IssueResult> {
    void prisma;
    void campaignId;
    void userKey;
    // TODO: 위 뼈대를 참고해 직접 구현
    // throw new HttpError(501, 'pessimistic 전략 미구현 — 직접 작성하세요');

    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{issuedCount: number; totalStock: number }[]>`
        SELECT "issuedCount", "totalStock" FROM "Campaign"
        WHERE "id" = ${campaignId}
        FOR UPDATE
      `;

      const row = rows[0];

      if (!row) throw new HttpError(404, 'Campaign not found');

      // 2) 재고 검사 (이제 이 검사~증가는 락으로 보호됨)
    if (row.issuedCount >= row.totalStock) return { ok:false, reason:'SOLD_OUT' };

    // 3) 증가 + 쿠폰 생성 (tx 사용). unique 위반 시 ALREADY_ISSUED
    //    - 트랜잭션 안에서 throw 하면 자동 롤백되므로, atomic처럼 수동 decrement 불필요.
    //      단, ALREADY_ISSUED 를 "정상 결과"로 돌려주려면 create 를 try/catch 로 감싸고
    //      롤백시키지 말지(=결과 반환) 정할 것. (힌트: 증가와 생성을 한 트랜잭션에 두면,
    //       create 실패 시 throw → 증가도 롤백됨 → 깔끔)
    try {
        const coupon = await tx.coupon.create({
          data: { campaignId, userKey },
        });

        await tx.campaign.update({
          where: {id: campaignId},
          data: {issuedCount: {increment: 1}},
        });

        return { ok: true, couponId: coupon.id };
      } catch (error) {
        // await tx.campaign.update({
        //   where: {id: campaignId},
        //   data: {issuedCount: {decrement: 1}},
        // });

        return { ok: false, reason: 'ALREADY_ISSUED' };
      }
    });
  },
};
