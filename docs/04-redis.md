# Stage 4 — 동시성 ❸ Redis 원자 카운터

## 목표

지금까지 DB가 맡던 "재고 게이트키핑"을 **Redis로 옮긴다.** Redis의 원자 연산(`DECR`)으로
초과 발급을 막고, DB 락/재시도 없이 더 빠른 처리량을 얻는다.

## 아이디어

- 재고 카운터를 Redis 키에 둔다: `campaign:{id}:stock`.
- Redis는 **단일 스레드**라 `DECR`(1 감소)가 원자적 → 두 요청이 동시에 마지막 1개를 못 가져간다.
- 재고 = Redis, 발급 기록(쿠폰) = DB. **역할 분리.**

```ts
const remaining = await redis.decr(stockKey); // 감소 "후" 값 반환
if (remaining < 0) {
  await redis.incr(stockKey);                 // 과다 감소분 반납
  return { ok: false, reason: 'SOLD_OUT' };
}
try {
  const coupon = await prisma.coupon.create({ data: { campaignId, userKey } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { issuedCount: { increment: 1 } } });
  return { ok: true, couponId: coupon.id };
} catch (e) {
  if (!isUniqueViolation(e)) throw e;
  await redis.incr(stockKey);                 // 중복 발급 → 확보한 슬롯 반납
  return { ok: false, reason: 'ALREADY_ISSUED' };
}
```

- **슬롯 반납(rollback)**: 품절(음수 보정)·중복 발급 시 `INCR`로 되돌려 카운터를 정확히 유지.
  실제로 부하테스트 후 Redis 키가 **정확히 0**으로 수렴(누수 없음).
- seed가 DB와 함께 Redis 키도 초기화한다(`prisma/seed.ts`).

## 벤치마크 (재고 100 / 동시 1000) — 최종 5전략

| 전략 | 발급 결과 | p95 응답 | 게이트키퍼 | 특징 |
|------|-----------|---------|-----------|------|
| naive | ❌ 175 | ~458ms | 없음 | 초과 발급 |
| atomic | ✅ 100 | ~382ms | DB(원자 UPDATE) | 정확 + 빠름 |
| pessimistic | ✅ 100 | ~825ms | DB(행 잠금) | 락 직렬화로 느림 |
| optimistic | ✅ 100 | ~4.3s | DB(version+재시도) | 재시도 폭풍 |
| **redis** | ✅ 100 | **~300ms** | **Redis(DECR)** | 경합을 인메모리로 분리 → 최速 |

## 결론

경합 지점을 **DB 밖(인메모리 Redis)** 으로 빼내면 락 대기도 재시도도 없어 가장 빠르다.
선착순 이벤트에서 Redis를 쓰는 이유. 단, Redis와 DB **두 저장소의 정합성**(반납/보정)을
직접 관리해야 하는 부담이 새로 생긴다 — 그게 이 전략의 트레이드오프.

## 심화(선택)

- **Lua 스크립트**: `GET → 검사 → DECR`을 `redis.eval`로 원자화하면 음수로 내려가는 일 자체가
  없어져 `INCR` 보정이 불필요해진다.
- **비동기 발급 큐**: 요청은 Redis 큐에 넣고 워커가 순차로 DB 반영 → 응답 지연 최소화.

## 검증

```bash
npm run seed      # DB + Redis 키(=100) 초기화
k6 run -e STRATEGY=redis load/issue.k6.js
npm run count     # 정확히 100
docker exec coupon-redis redis-cli GET campaign:demo-campaign:stock   # 0
```

## 다음

Stage 5 — 인증/사용자 관리(JWT, 1인 1매). `userKey`를 실제 로그인 유저 id로 연결.
