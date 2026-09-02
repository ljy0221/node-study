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
| redis | ✅ 100 | ~300ms | Redis(DECR+보정) | 경합을 인메모리로 분리 |
| **redis-lua** | ✅ 100 | **~246ms** | **Redis(Lua 원자)** | 최速, 음수 진입 없음 |

## 결론

경합 지점을 **DB 밖(인메모리 Redis)** 으로 빼내면 락 대기도 재시도도 없어 가장 빠르다.
선착순 이벤트에서 Redis를 쓰는 이유. 단, Redis와 DB **두 저장소의 정합성**(반납/보정)을
직접 관리해야 하는 부담이 새로 생긴다 — 그게 이 전략의 트레이드오프.

## 심화 ① Lua 스크립트 (`redis-lua`, 구현 완료)

기존 `redis`는 "일단 DECR → 음수면 INCR로 되돌림"이라, 품절 순간 900개 요청이
카운터를 음수로 내렸다 되돌리는 왕복(명령 2번)이 있었다. Lua로 `GET → 검사 → DECR`을
**한 번의 원자 실행**으로 묶으면 애초에 음수로 안 내려가고 품절 보정도 사라진다.

```lua
local stock = tonumber(redis.call('GET', KEYS[1]))
if stock == nil then return -1 end
if stock <= 0 then return -1 end   -- 품절: DECR 안 함 → 음수 진입 없음
return redis.call('DECR', KEYS[1])
```
```ts
const res = Number(await redis.eval(STOCK_LUA, 1, stockKey));
// res === -1 → SOLD_OUT (INCR 보정 불필요), res >= 0 → 슬롯 확보
```

| | redis | redis-lua |
|--|-------|-----------|
| 품절 경로 | DECR→음수→INCR (명령 2번) | eval 1번 (DECR 안 함) |
| 음수 상태 | 순간 발생 | **구조적으로 없음** |
| p95 | ~300ms | **~246ms** |

핵심 교훈: **"일단 하고 되돌리기"보다 "원자적으로 검사 후 실행"** 이 빠르고 깔끔하다.
Redis는 Lua 실행 중 다른 명령을 끼워넣지 않으므로(단일 스레드) 스크립트 전체가 임계 영역이 된다.

## 심화 ② 비동기 발급 큐 (`redis-queue` + worker, 구현 완료)

DB 쓰기를 요청 경로에서 아예 빼낸다.

- **요청**(`issue.redisQueue.ts`): Lua로 슬롯 선점 → `LPUSH issue-queue` → **즉시 202 Accepted**.
  DB를 건드리지 않는다.
- **워커**(`worker.ts`, 별도 프로세스): `BRPOP issue-queue` → 쿠폰 생성 + issuedCount 증가.
  중복(P2002)이면 선점 슬롯을 `INCR`로 반납. 실행: `npm run worker`.

```ts
// 요청
const res = Number(await redis.eval(STOCK_LUA, 1, stockKey));
if (res === -1) return { ok: false, reason: 'SOLD_OUT' };
await redis.lpush('issue-queue', JSON.stringify({ campaignId, userKey }));
return { ok: true, queued: true };   // → 202
```

| | 동기 redis-lua | 비동기 redis-queue |
|--|---------------|--------------------|
| 요청이 하는 일 | Lua + **DB 쿠폰 생성** | Lua + **LPUSH만** |
| p95 | ~246ms | **~112ms** |
| 발급 확정 시점 | 응답 즉시 | 워커가 큐 비운 뒤(최종 일관성) |

**핵심 교훈**: DB를 요청 경로에서 빼면 응답이 가장 빠르다. 대신 발급이 "즉시"가 아니라
"곧"이 되는 최종 일관성을 받아들여야 한다.

⚠️ **큐 기반 시스템의 함정**: 큐는 DB와 **독립된 저장소**다. 테스트 중 DB만 리셋하고
큐를 안 비우면, 이전 실행의 잔여 작업이 다음 실행과 섞여 카운터가 꼬인다(초과/누수처럼 보임).
→ `seed`가 `DEL issue-queue`로 큐도 함께 리셋하도록 했다.

### 검증 (워커를 따로 띄워야 함)

```bash
npm run worker          # 터미널 A (상주)
npm run seed            # 터미널 B: DB + Redis키 + 큐 리셋
k6 run -e STRATEGY=redis-queue load/issue.k6.js
# 큐가 빌 때까지 대기 후
npm run count           # 100
```

## 검증

```bash
npm run seed      # DB + Redis 키(=100) 초기화
k6 run -e STRATEGY=redis load/issue.k6.js
npm run count     # 정확히 100
docker exec coupon-redis redis-cli GET campaign:demo-campaign:stock   # 0
```

## 다음

Stage 5 — 인증/사용자 관리(JWT, 1인 1매). `userKey`를 실제 로그인 유저 id로 연결.
