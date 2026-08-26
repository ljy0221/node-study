# Stage 0 — 스캐폴딩 & 워킹 스켈레톤

## 목표

"발급 버튼을 누르면 재고가 줄어든다"는 **최소 동작**을 프론트↔백↔DB 端-to-端으로 연결한다.
아직 동시성은 신경 쓰지 않는다. 뼈대가 실제로 돌아가는지 확인하는 단계.

## 만든 것

### 백엔드 (`apps/server`)
- `config.ts` — 환경변수 로딩/검증
- `db.ts` — **PrismaClient 싱글턴** (핫리로드 커넥션 누수 방지, Prisma 공식 패턴)
- `redis.ts` — ioredis 싱글턴 (Stage 4부터 사용)
- `middleware/errorHandler.ts` — 공통 에러 핸들러 + `asyncHandler` 래퍼
- `services/types.ts` — 발급 전략 공통 인터페이스 `IssueStrategy`
- `services/issue.naive.ts` — **참고용** 나이브 전략 (Stage 2에서 이걸로 경쟁 조건을 재현)
- `services/registry.ts` — 전략 레지스트리 (`?strategy=` 로 골라 벤치)
- `routes/campaigns.ts` — `GET /:id`, `POST /:id/issue`
- `app.ts` / `index.ts` — 앱 조립 & 부트스트랩

### 프론트 (`apps/web`)
- `api.ts` — API 호출 래퍼
- `App.tsx` — 재고 표시 + 발급 버튼 + 로그 (2초 폴링)

### 도메인 (`prisma/schema.prisma`)
- `User` / `Campaign(totalStock, issuedCount, version)` / `Coupon(campaignId, userKey, unique)`

## Node 관점 메모 (Java 개발자용)

- **ESM + `.js` import**: TS인데 상대 import에 `.js`를 붙인다(`./db.js`). Node의 ESM 모듈 해석 규칙 때문. tsx/번들러가 실제 `.ts`로 이어준다.
- **싱글턴을 `globalThis`에 캐싱**: Spring의 싱글턴 빈과 목적은 같지만(커넥션 재사용), DI 컨테이너가 없으니 직접 관리한다. `tsx watch`가 모듈을 다시 평가할 때 커넥션이 쌓이는 걸 막는 장치.
- **에러 미들웨어 인자 4개**: Express는 함수 인자 개수로 에러 핸들러를 구분한다. `(err, req, res, next)`.

## 검증

```bash
npm install
cp apps/server/.env.example apps/server/.env   # Windows: copy apps\server\.env.example apps\server\.env
cp apps/web/.env.example apps/web/.env
npm run db:up               # Docker Desktop 실행 필요
npm run prisma:migrate      # 최초 1회 마이그레이션 생성
npm run seed                # demo-campaign, 재고 100
npm run dev
```

> 모노레포 주의: Prisma는 `apps/server`에서 실행되므로 `.env`도 **앱별로** 둔다(루트 아님).

- http://localhost:4000/health → `{ ok: true, strategies: ["naive"] }`
- http://localhost:5173 → 발급 버튼 클릭 시 재고 감소 확인

## 다음 (Stage 1)

Campaign CRUD API와 목록 화면을 붙인다. 그 다음 Stage 2에서 드디어 동시성 문제를 재현한다.
