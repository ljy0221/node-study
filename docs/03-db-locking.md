# Stage 3 — 동시성 ❷ DB 레벨 락 (3가지 전략)

## 목표

Stage 2에서 재현한 초과 발급을 **DB 레벨에서** 세 가지 방법으로 잡고, 같은 부하(재고 100 / 동시 1000)에서 정확성과 성능을 비교한다. 세 전략 모두 직접 구현.

## 전략별 핵심

### ① 원자적 조건부 UPDATE — `issue.atomic.ts`
검사와 증가를 UPDATE 한 문장으로 원자화. 락을 명시적으로 걸지 않는다.
```sql
UPDATE "Campaign" SET "issuedCount" = "issuedCount" + 1
WHERE "id" = ${campaignId} AND "issuedCount" < "totalStock";
```
- 영향 행 1 = 성공, 0 = 품절. `prisma.$executeRaw`가 영향 행 수를 반환.
- Prisma `where`는 컬럼 vs 컬럼(`issuedCount < totalStock`) 비교를 못 해서 raw SQL 사용.

### ② 비관적 락 — `issue.pessimistic.ts`
트랜잭션 안에서 행을 잠그고(대기시키고) 검사·증가.
```ts
prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT ... FROM "Campaign" WHERE "id" = ${id} FOR UPDATE`;
  // 검사 → tx.coupon.create → tx.campaign.update
});
```
- ⚠️ 트랜잭션 콜백 안에서는 반드시 `tx` 사용(전역 `prisma`면 다른 커넥션 → 락 무의미).
- create 실패 시 throw → 트랜잭션 자동 롤백(수동 decrement 불필요).

### ③ 낙관적 락 — `issue.optimistic.ts`
락을 안 걸고, 읽은 `version`을 조건에 넣어 UPDATE. 불일치(영향 0)면 재시도.
```ts
const r = await prisma.campaign.updateMany({
  where: { id, version: c.version },
  data:  { issuedCount: { increment: 1 }, version: { increment: 1 } },
});
if (r.count === 0) continue; // 경합 → 재시도
```
- 조건이 `version = 상수`라 raw SQL 불필요(Prisma `updateMany`로 충분).
- 롤백 시 **id로만 찾고 issuedCount만 -1** (옛 version으로 찾으면 P2025, version은 되돌리면 CAS 꼬임 — `issue.optimistic.ts` 주석 참고).

## 벤치마크 (재고 100 / 동시 1000)

| 전략 | 발급 결과 | p95 응답 | 처리량(issued/s) | 평가 |
|------|-----------|---------|-----------------|------|
| naive (Stage 2) | ❌ 175 / 100 | ~458ms | 221/s | 빠르지만 초과 발급 |
| **atomic** | ✅ 100 | ~458ms | 221/s | 정확 + 빠름 → 선착순 최적 |
| **pessimistic** | ✅ 100 | ~764ms | 32/s | 정확, 락 직렬화로 느림 |
| **optimistic** | ✅ 100 | ~6.3s | 13/s | 정확, 경합 심하면 재시도 폭풍 |

> 숫자는 실행 환경/타이밍에 따라 달라지지만 경향(atomic ≪ pessimistic ≪ optimistic 지연)은 일관됨.

## 결론

**단일 행에 경합이 몰리는 선착순**에는 원자적 조건부 UPDATE가 정확성·성능 모두 우위.
- 비관적 락: 여러 행에 걸친 복합 검사/갱신이 필요할 때.
- 낙관적 락: 경합이 드문 도메인(수정 충돌이 예외적)일 때. 선착순처럼 경합이 극심하면 재시도가 폭증해 오히려 불리.

## 검증 방법

```bash
npm run seed
k6 run -e STRATEGY=<naive|atomic|pessimistic|optimistic> load/issue.k6.js
npm run count      # issuedCount == 실제 쿠폰 수, 초과 0 확인
```

## 다음 (Stage 4)

Redis 원자 카운터(`DECR`/Lua)로 재고 선점 후 DB 반영 → DB 락보다 빠른 동시성 제어를 실무 방식으로.
