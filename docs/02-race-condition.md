# Stage 2 — 동시성 ❶ 나이브: 경쟁 조건 재현

## 목표

수정 전에 **문제를 먼저 눈으로 본다.** 재고 100짜리 쿠폰에 동시 1000 요청을 때려서
`naive` 전략이 초과 발급하는 걸 계측한다.

## 실험

```bash
npm run seed --workspace apps/server      # 재고 100, 쿠폰 비움
k6 run load/issue.k6.js                    # VU 200, 총 1000 요청, strategy=naive
docker exec coupon-postgres psql -U coupon -t -c 'SELECT COUNT(*) FROM "Coupon";'
```

## 결과 (재현됨 💥)

| 항목 | 값 |
|------|-----|
| 재고(totalStock) | 100 |
| **실제 발급(COUNT)** | **175** |
| issuedCount / remaining | 175 / **-75** |
| 발급 성공(201) | 175 |
| 품절(410) | 825 |
| p95 응답시간 | ~458ms |

→ **75개 초과 발급.** 실행마다 숫자는 달라지지만(타이밍 의존) 항상 100을 넘는다.

## 왜 터지나 — Node 단일 스레드인데도?

`issue.naive.ts`의 흐름:

```
① const c = await prisma.campaign.findUnique(...)   // 재고 읽기   ← await
② if (c.issuedCount >= c.totalStock) return SOLD_OUT // 검사 (동기)
③ await prisma.campaign.update({ increment: 1 })     // 재고 쓰기   ← await
④ await prisma.coupon.create(...)                    // 쿠폰 생성   ← await
```

핵심은 **`await`가 이벤트 루프의 양보(yield) 지점**이라는 것.

- Node는 스레드가 하나지만, `await`를 만나면 그 요청은 **I/O 응답을 기다리며 멈추고**, 이벤트 루프는 **대기 중인 다른 요청**을 실행한다.
- 그래서 요청 A가 ①에서 "issuedCount=99, 아직 남았네" 읽고 ③으로 가기 전에,
  요청 B·C·D…도 똑같이 ①에서 **99를 읽어버린다.** 전부 "남았다"고 판단 → 전부 발급.
- 검사(②)와 쓰기(③)가 **원자적이지 않다**(read-modify-write 사이에 틈이 있다). 이게 경쟁 조건.

### Java와의 대비 (중요)

| | Java/Spring | Node |
|--|--|--|
| 동시성 주체 | 여러 **스레드** | 단일 스레드 + **비동기 I/O** |
| 경쟁 발생 지점 | 공유 메모리/락 없는 임계영역 | **`await` 경계** (DB I/O 대기) |
| "동시에 99를 읽음" | 스레드 스케줄링 | 이벤트 루프 인터리빙 |

결론은 같다: **read → check → write를 원자적으로 만들지 않으면 초과 발급된다.**
언어가 달라도 동시성의 본질(원자성 부재)은 동일하다는 걸 몸으로 확인한 것.

## 다음 (Stage 3)

이 문제를 **DB 레벨에서** 세 가지 방법으로 고친다 — 직접 작성:
1. 원자적 조건부 UPDATE (가장 실용적)
2. 비관적 락 (`SELECT ... FOR UPDATE`)
3. 낙관적 락 (`version` 컬럼 + 재시도)

각각 구현 후 같은 k6를 돌려 **COUNT가 정확히 100인지** 검증한다.
