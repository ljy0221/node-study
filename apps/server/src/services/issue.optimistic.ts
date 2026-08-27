import { prisma } from "../db.js";
import { HttpError } from "../middleware/errorHandler.js";
import type { IssueResult, IssueStrategy } from "./types.js";

// ============================================================
// Stage 3 실습 ③: 낙관적 락 (version 컬럼 + 재시도)  ← 직접 구현
// ============================================================
//
// 아이디어: 락을 걸지 않는다. 대신 읽어온 version을 조건에 넣어 UPDATE하고,
//          "그 사이 version이 바뀌었으면"(영향 행 0) 다시 읽고 재시도한다.
//
// 핵심 흐름 (재시도 루프):
//   for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
//     // 1) 현재 상태 읽기 (락 없음)
//     const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
//     if (!c) throw new HttpError(404, 'Campaign not found');
//     if (c.issuedCount >= c.totalStock) return { ok:false, reason:'SOLD_OUT' };
//
//     // 2) version 조건부 UPDATE — updateMany는 "조건 불일치면 0건"이 되어 낙관적 락에 딱.
//     //    (updateMany는 컬럼=상수 비교라 raw SQL 불필요! version 값은 방금 읽은 c.version)
//     const r = await prisma.campaign.updateMany({
//       where: { id: campaignId, version: c.version },
//       data:  { issuedCount: { increment: 1 }, version: { increment: 1 } },
//     });
//
//     // 3) r.count === 0 이면 경합 발생(다른 요청이 먼저 커밋) → 루프 재시도(continue)
//     if (r.count === 0) continue;
//
//     // 4) 성공 → 쿠폰 생성. unique 위반이면 ALREADY_ISSUED (이때는 증가를 되돌려야 함:
//     //    낙관적 락은 트랜잭션으로 안 묶었으니 atomic처럼 수동 decrement 필요)
//     ...
//   }
//   // 재시도 다 소진 → 사실상 경합 과다. 실무선 에러/재큐잉. 여기선 SOLD_OUT 근사 or 409.
//
// 왜 여기선 updateMany(raw SQL 아님)?
//   atomic은 "issuedCount < totalStock"(컬럼 vs 컬럼) 비교라 raw가 필요했지만,
//   낙관적 락의 조건은 "version = 방금 읽은 값"(컬럼 vs 상수)이라 Prisma where로 표현 가능.
//
// 생각해볼 점: 경합이 극심한 선착순에선 재시도가 폭증해서 낙관적 락이 오히려 불리할 수 있다.
//            k6 결과의 처리량/응답시간을 atomic·pessimistic과 비교해보라.
//
// 검증:
//   npm run seed
//   k6 run -e STRATEGY=optimistic load/issue.k6.js
//   npm run count      → 정확히 100

const MAX_RETRY = 50;

export const optimisticStrategy: IssueStrategy = {
  name: "optimistic",

  async issue(campaignId: string, userKey: string): Promise<IssueResult> {
    void prisma;
    void campaignId;
    void userKey;
    void MAX_RETRY;
    // TODO: 위 흐름을 참고해 재시도 루프로 직접 구현
    // throw new HttpError(501, 'optimistic 전략 미구현 — 직접 작성하세요');

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

        return { ok: false, reason: 'ALREADY_ISSUED' };
      }
    }

    return {ok: false, reason: "ALREADY_ISSUED"};
  },
};
