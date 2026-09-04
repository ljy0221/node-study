# Stage 5 — 인증 / 사용자 관리

## 목표

`userKey`라는 임시 개념을 **실제 로그인 유저**로 대체한다. JWT 기반 인증을 붙이고,
"1인 1매"를 진짜 유저 기준으로 강제한다. 기존 동시성 부하테스트는 그대로 동작하게 유지.

## 구성

| 파일 | 역할 |
|------|------|
| `auth.ts` | `hashPassword`/`verifyPassword`(bcrypt), `signToken`/`verifyToken`(JWT) |
| `routes/auth.ts` | `POST /api/auth/register`, `POST /api/auth/login` |
| `middleware/requireAuth.ts` | `requireAuth`(필수), `optionalAuth`(선택) + `req.user` 타입 확장 |
| `routes/coupons.ts` | `GET /api/coupons/mine` (보호됨) |
| `routes/campaigns.ts` | 발급 시 `userKey = req.user?.id ?? body.userKey` |

## 설계 포인트

- **비밀번호**: bcrypt 해시만 저장(평문 금지). `bcrypt.compare`로 검증.
- **JWT**: `{ sub: userId, email }` 페이로드, `expiresIn: '1h'`. 미들웨어가 `Authorization: Bearer <token>`을 검증해 `req.user`를 채운다.
- **user enumeration 방지**: 로그인 실패 시 "이메일 없음"과 "비번 틀림"을 **하나의 401**로 뭉뚱그린다.
- **userKey 승계**: 스키마 변경 없이 `Coupon.userKey`에 로그인 유저 id를 넣어 `@@unique([campaignId, userKey])`가 곧 "1인 1매"가 된다.
- **k6 호환**: 발급 라우트는 `optionalAuth`. 토큰 있으면 유저 id, 없으면 body userKey → 기존 부하테스트 무수정.

## 실무 함정 3종 (직접 재현하며 학습)

1. **`await` 누락** — `!verifyPassword(...)`는 `!Promise` = `!truthy` = `false`. 비번 검사가 통째로 무력화돼 **틀린 비번도 로그인**됨(보안 사고). → `await` 필수.
2. **`await` 위치** — `await !verifyPassword(x)` ❌ (Promise를 먼저 부정 → false를 await) vs `!(await verifyPassword(x))` ✅. **괄호로 순서를 명시**.
3. **Bearer 파싱 순서** — 잘라낸 토큰을 검사(❌)하지 말고, **자르기 전 헤더**를 `startsWith('Bearer ')`로 확인(✅).

공통 교훈: 가드문 `if (...) throw`의 조건은 **"나쁜 경우"** 를 가리켜야 한다. `!` 방향이 헷갈리면 "이게 나쁜 상태인가?"로 읽는다. (이런 부류는 ESLint `@typescript-eslint/no-misused-promises`가 잡아준다.)

## 검증

```bash
# 회원가입/로그인
curl -X POST localhost:4000/api/auth/register -H "Content-Type: application/json" -d '{"email":"me@test.com","password":"password123"}'   # 201 + token
curl -X POST localhost:4000/api/auth/login    -H "Content-Type: application/json" -d '{"email":"me@test.com","password":"password123"}'   # 200 + token
# 토큰으로 발급 → 201, 같은 토큰 재발급 → 409(1인 1매)
curl -X POST "localhost:4000/api/campaigns/demo-campaign/issue?strategy=atomic" -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{}'
# 내 쿠폰 → 발급분 확인
curl localhost:4000/api/coupons/mine -H "Authorization: Bearer <TOKEN>"
# 토큰 없이 body userKey → 여전히 동작(k6 호환)
```

## 다음

Stage 1 — CRUD 보강(캠페인 생성/목록 + 관리자 인가) → Stage 5.5 선착순 보안 하드닝(레이트리밋·봇방어 등).
