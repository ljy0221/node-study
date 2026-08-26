import { prisma } from '../db.js';
import { HttpError } from '../middleware/errorHandler.js';
import type { IssueResult, IssueStrategy } from './types.js';

// ============================================================
// Stage 3 실습 ①: 원자적 조건부 UPDATE 전략  ← 직접 구현할 파일
// ============================================================
//
// 목표: naive의 "읽고 → 검사 → 쓰기" 사이의 틈을 없앤다.
//       검사와 증가를 DB의 단일 UPDATE 문 하나로 원자적으로 처리한다.
//
// 핵심 아이디어 (SQL):
//   UPDATE "Campaign"
//   SET    "issuedCount" = "issuedCount" + 1
//   WHERE  "id" = $1 AND "issuedCount" < "totalStock";
//   → 영향받은 행 수(affected rows)가 1이면 성공, 0이면 품절.
//   DB가 이 UPDATE를 원자적으로 처리하므로 두 요청이 동시에 마지막 1개를 못 가져간다.
//
// 왜 Prisma의 updateMany가 아니라 raw SQL인가?
//   Prisma where 절은 "컬럼 < 컬럼"(issuedCount < totalStock) 비교를 지원하지 않는다.
//   그래서 prisma.$executeRaw 로 원시 SQL을 쓴다.
//   $executeRaw 는 "영향받은 행 수"(number)를 반환한다. ← 성공/품절 판정에 사용.
//
// 구현 순서 힌트:
//   1) prisma.$executeRaw`...` 로 위 조건부 UPDATE 실행, 반환값(affected) 받기
//      - 태그드 템플릿(백틱) 안에 ${campaignId} 를 넣으면 자동으로 파라미터 바인딩됨(SQL 인젝션 안전)
//      - 컬럼/테이블명은 큰따옴표 필요: "Campaign", "issuedCount", "totalStock"
//   2) affected === 0 이면  → { ok: false, reason: 'SOLD_OUT' }
//   3) affected === 1 이면  → prisma.coupon.create 로 쿠폰 생성
//      - 여기서 (campaignId, userKey) unique 위반이 나면 = 이미 발급받은 유저
//        → issuedCount 를 다시 1 되돌리고(decrement) { ok:false, reason:'ALREADY_ISSUED' }
//   4) 성공 시 { ok: true, couponId }
//
// 검증(구현 후):
//   npm run seed --workspace apps/server
//   k6 run -e STRATEGY=atomic load/issue.k6.js
//   docker exec coupon-postgres psql -U coupon -t -c 'SELECT COUNT(*) FROM "Coupon";'
//   → COUNT 가 정확히 100 이어야 한다. (naive는 175였음)

export const atomicStrategy: IssueStrategy = {
  name: 'atomic',

  async issue(campaignId: string, userKey: string): Promise<IssueResult> {
    // campaign 존재 확인은 아래처럼 참고용으로 남겨둠(원한다면 유지/삭제 자유)
    const exists = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });
    if (!exists) throw new HttpError(404, 'Campaign not found');

    // TODO: 여기부터 직접 구현 (위 힌트 참고)
    // throw new HttpError(501, 'atomic 전략 미구현 — 직접 작성하세요');
    const affected = await prisma.$executeRaw`
        UPDATE "Campaign"
        SET "issuedCount" = "issuedCount" + 1
        WHERE "id" = ${campaignId} AND "issuedCount" < "totalStock"
      `

    if (affected === 0) {
      return {ok: false, reason: 'SOLD_OUT'};
    } else if (affected === 1) {
      try {
        const coupon = await prisma.coupon.create({
          data: { campaignId, userKey },
        });
        return { ok: true, couponId: coupon.id };
      } catch (error) {
        await prisma.campaign.update({
          where: {id: campaignId},
          data: {issuedCount: {decrement: 1}},
        });

        return { ok: false, reason: 'ALREADY_ISSUED' };
      }
    }

    return { ok: false, reason: 'ALREADY_ISSUED' };
  },
};
