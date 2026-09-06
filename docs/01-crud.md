# Stage 1 — CRUD & 관리자 인가

## 목표

캠페인 **목록/생성** API를 붙이되, 인증(Stage 5) 위에 **인가(authorization)** 를 얹는다.
목록은 공개, 생성은 **관리자만**. "인증을 먼저 깔았기에 인가를 자연스럽게 조합"하는 흐름을 체득.

> 학습용 순서상 동시성(2~4)·인증(5)을 먼저 하고 CRUD를 뒤에 붙였다. 실무라면 CRUD가 더 앞이지만,
> 인증 → CRUD 순서 자체는 실무와 동일하다(인가를 각 기능에 함께 넣게 되므로).

## 구성

| 엔드포인트 | 접근 | 미들웨어 |
|-----------|------|---------|
| `GET /api/campaigns` | 공개 | 없음 |
| `POST /api/campaigns` | 관리자 | `[requireAuth, requireAdmin]` |
| `GET /api/campaigns/:id` | 공개 | 없음 |

- `User.role` (enum `USER`/`ADMIN`) 추가, JWT 페이로드에 `role` 포함 → `requireAdmin`이 `req.user.role`로 판단.
- 관리자 계정은 seed가 생성: `admin@demo.com` / `admin1234`.

## 인증 vs 인가 (이 스테이지의 핵심)

| | 질문 | 실패 시 | 담당 |
|--|------|--------|------|
| **인증**(authentication) | "너 누구야?" | **401** | `requireAuth` |
| **인가**(authorization) | "너 권한 있어?" | **403** | `requireAdmin` |

미들웨어 **체인**으로 표현: `requireAuth`가 먼저 `req.user`를 채우고, `requireAdmin`이 그 위에서 role만 본다.
```ts
campaignsRouter.post('/', requireAuth, requireAdmin, asyncHandler(...))
```

## 검증

```bash
curl localhost:4000/api/campaigns                     # 200 (공개 목록)
# 관리자 로그인 → 토큰
curl -X POST localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@demo.com","password":"admin1234"}'
curl -X POST localhost:4000/api/campaigns -H "Authorization: Bearer <ADMIN>" -H "Content-Type: application/json" -d '{"name":"신규","totalStock":30}'   # 201
curl -X POST localhost:4000/api/campaigns -H "Authorization: Bearer <USER>"  ... # 403 (일반 유저)
curl -X POST localhost:4000/api/campaigns ...                                     # 401 (토큰 없음)
```

| 시나리오 | 상태 |
|----------|------|
| 목록 | 200 |
| 토큰 없이 생성 | 401 |
| 일반 유저 생성 | 403 |
| 관리자 생성 | 201 |
| 음수 재고 | 400 (Zod) |

## 설계 메모

- **role in JWT**: 매 요청 DB 조회 없이 role 판단(빠름). 단점 — 권한 변경이 토큰 만료(1h)까지 반영 안 됨. 트래픽/요구에 따라 "DB 조회형"으로 바꿀 수 있음.
- 캠페인 생성 API가 생겼지만, seed의 고정 `demo-campaign`은 부하테스트 재현성을 위해 유지.

## 다음

Stage 5.5 — 선착순 보안 하드닝(레이트 리밋·중복요청 멱등성·봇 방어) → Stage 6 Nest/Next 마이그레이션.
