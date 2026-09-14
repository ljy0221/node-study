# Stage 5.5 — 선착순 보안 하드닝

인증(Stage 5) 위에 얹은 4가지 방어. 유저/IP 기준이라 인증이 먼저 있어야 자연스럽게 붙는다.

| 조각 | 막는 것 | 핵심 기술 |
|------|---------|-----------|
| 로그인 레이트 리밋 | 브루트포스/크리덴셜 스터핑 | Redis 카운터 |
| 발급 레이트 리밋 | 봇 스팸 | Redis 카운터 + env 토글 |
| helmet | XSS·클릭재킹·MIME 스니핑 등 | 보안 HTTP 헤더 |
| 멱등성 키 | 재전송·더블클릭 중복 처리 | 응답 캐싱/재생 |

---

## 1. 레이트 리밋 (Redis 고정 윈도우)

`middleware/rateLimit.ts` — 식별자(IP)별로 "이번 윈도우 요청 수"를 Redis 카운터로 센다.
```ts
const count = await redis.incr(key);
if (count === 1) await redis.expire(key, windowSec); // 첫 요청에만 TTL → 윈도우 지나면 자동 리셋
if (count > limit) throw new HttpError(429, '요청이 너무 많습니다');
next();
```
- 적용: 로그인 60초 5회, 발급 60초 30회.
- **함정과 해결**: 발급 IP 제한이 k6 부하테스트(한 IP 폭주)를 막는다 → `RATE_LIMIT_DISABLED=true`
  env 토글로 부하테스트 때만 해제. (내 방어가 내 테스트를 막는 실무 딜레마)

---

## 2. helmet — 보안 HTTP 헤더 (처음 보는 개념 정리)

`app.use(helmet())` 한 줄로 응답에 **여러 보안 헤더**를 자동으로 붙인다. 브라우저는 이 헤더들을
보고 "이 응답을 어떻게 다뤄야 안전한지" 판단한다. 즉 **서버가 브라우저에게 주는 보안 지시서**다.

| 헤더 | 값(예) | 막는 공격 |
|------|--------|-----------|
| `X-Content-Type-Options` | `nosniff` | **MIME 스니핑** — 브라우저가 Content-Type을 무시하고 내용을 멋대로 추측해 실행하는 것 차단 |
| `X-Frame-Options` | `SAMEORIGIN` | **클릭재킹** — 내 페이지를 악성 사이트가 `<iframe>`에 몰래 넣어 클릭을 가로채는 것 차단 |
| `Strict-Transport-Security` | `max-age=…` | **다운그레이드/중간자** — 이후 접속을 무조건 HTTPS로 강제 (HSTS) |
| `Referrer-Policy` | `no-referrer` | **URL 유출** — 다른 사이트로 이동 시 내 URL(민감정보 포함 가능)을 안 넘김 |
| `Cross-Origin-*-Policy` | `same-origin` | 크로스 오리진 격리 (다른 출처가 내 리소스를 함부로 로드/공유 못 하게) |
| `X-Powered-By` 제거 | (없음) | **정보 노출** — "Express로 만들었음"을 숨겨 공격 힌트 감소 |

- **CSP(Content-Security-Policy)**: helmet 기본값은 제한적 CSP도 켠다. HTML을 서빙하는 앱에서 XSS
  방어에 핵심이지만, 우리처럼 **JSON API + 별도 프론트**면 영향이 적다.
- **cors와의 차이**: cors는 "어느 출처가 이 API를 호출할 수 있나"(우리가 이미 허용), helmet의
  CORP/COOP는 "내 응답을 어떻게 격리하나". 서로 다른 층이라 **함께** 쓴다. 실제로 helmet 적용 후에도
  프론트(:5173)→API(:4000) fetch는 정상 동작함을 확인했다(cors가 CORS를 처리하므로).

---

## 3. 멱등성 키 (Idempotency-Key)

같은 요청이 두 번 와도(네트워크 재전송, 더블클릭) **두 번째는 처리하지 않고 첫 응답을 그대로 재생**한다.
클라이언트가 `Idempotency-Key: <고유값>` 헤더를 보내고, 서버는 그 키로 응답을 캐싱한다.

- 같은 키 2회 → **couponId 동일**(재생, 409 아님)
- 다른 키(같은 유저) → 409 (**1인1매는 별개 층**으로 그대로 작동)
- 결제 API 등에서 "중복 결제 방지"에 쓰는 그 패턴.

### 플럼빙(plumbing)이란? — `res.json` 가로채기 정리

"플럼빙"은 배관, 즉 **눈에 안 보이는 뒤쪽 배선/배관 작업**을 뜻하는 은어다. 여기선
**핸들러가 응답을 보내는 순간을 중간에서 낚아채는 장치**를 말한다.

문제: 멱등성 저장을 하려면 "핸들러가 최종적으로 어떤 응답(status+body)을 보냈는지"를 알아야 한다.
그런데 핸들러는 그냥 `res.json(body)`를 호출할 뿐이다. 어떻게 그 값을 가로챌까?

방법: **몽키 패칭(monkey-patching)** — 원래 `res.json`을 백업해두고, 내 함수로 갈아끼운다.
```ts
const originalJson = res.json.bind(res);   // ① 원본 보관 (.bind으로 this 고정)
res.json = ((body) => {                    // ② 내 함수로 교체
  if (res.statusCode < 500)                //   응답 나가기 직전에 곁다리 작업(캐싱)
    void redis.set(cacheKey, JSON.stringify({ status: res.statusCode, body }), 'EX', ttl);
  return originalJson(body);               // ③ 그 다음 원래 동작 수행(진짜 응답 전송)
}) as typeof res.json;
```
- 핸들러가 `res.json(...)`을 부르면 → **내가 끼워넣은 함수가 먼저 실행**(캐싱) → 그 안에서 원본을 호출해 실제 전송.
- 로깅·응답 변환·캐싱 미들웨어가 흔히 쓰는 기법이다. 원본을 반드시 보관했다 호출해야 원래 기능이 안 깨진다.
- `.bind(res)`가 필요한 이유: 떼어낸 함수가 `this`(res)를 잃지 않게 묶어두는 것.

> 재생(replay) 쪽은 반대다: 캐시가 있으면 `res.status(status).json(body)`로 바로 응답하고 `return`해서
> **핸들러로 아예 안 넘어간다**(재실행 방지).

---

## 검증 요약

```bash
# 레이트 리밋: 로그인 6연속 → 6번째 429 / 발급 35연속 → 30 후 429
# helmet: curl -D - http://localhost:4000/health → 보안 헤더 확인
# 멱등성: 같은 Idempotency-Key 2회 → couponId 동일, 다른 키 → 409
```

## 남은 개선(선택)
- 프론트에서 발급 시 Idempotency-Key(UUID) 전송 → UI 더블클릭 방어 실제 활성화
- 401(토큰 만료) 응답 시 프론트 자동 로그아웃

## 다음
Stage 6 — Express→NestJS 마이그레이션.
