# 쿠폰 발급 시뮬레이션 (Coupon Issue Simulation)

선착순 쿠폰 발급을 소재로 **동시성 제어**를 학습하는 풀스택 프로젝트.
Spring Boot/Java 경험을 바탕으로 **Node.js 생태계에서 같은 문제를 어떻게 푸는지** 비교하며 익힌다.

## 스택

| 구분 | 기술 |
|------|------|
| 백엔드 | Express + Prisma + PostgreSQL + Redis (TypeScript) |
| 프론트 | React + Vite (TypeScript) |
| 인프라 | Docker Compose (Postgres, Redis) |
| 부하테스트 | k6 |

로드맵: **Express + React → NestJS + Next.js 마이그레이션** (전 과정 블로그 기록)

## 빠른 시작

```bash
# 1) 의존성 설치 (루트에서, workspaces 일괄)
npm install

# 2) 환경변수 (앱별로 .env 복사)
#    Windows PowerShell: copy apps\server\.env.example apps\server\.env  등
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env

# 3) DB/Redis 기동 (Docker Desktop 먼저 실행되어 있어야 함)
npm run db:up

# 4) Prisma 마이그레이션 + 시드 (재고 100 데모 캠페인)
npm run prisma:migrate
npm run seed

# 5) 서버 + 웹 동시 실행
npm run dev
```

- API: http://localhost:4000/health
- Web: http://localhost:5173

## 단계별 학습 노트

| Stage | 주제 | 문서 |
|-------|------|------|
| 0 | 스캐폴딩 & 워킹 스켈레톤 | [docs/00-setup.md](docs/00-setup.md) |
| 1 | CRUD & 도메인 | (예정) |
| 2 | 동시성 ❶ 나이브 — 경쟁 조건 재현 | [docs/02-race-condition.md](docs/02-race-condition.md) |
| 3 | 동시성 ❷ DB 락 (원자적/비관적/낙관적) | [docs/03-db-locking.md](docs/03-db-locking.md) |
| 4 | 동시성 ❸ Redis | [docs/04-redis.md](docs/04-redis.md) |
| 5 | 인증/사용자 관리 | [docs/05-auth.md](docs/05-auth.md) |
| 6 | 마무리 & Nest/Next 마이그레이션 | (예정) |

## 구조

```
apps/server   Express API (발급 전략이 이 프로젝트의 심장)
apps/web      React 프론트
load          k6 부하테스트 시나리오
docs          단계별 학습 노트 (블로그 초안)
```
