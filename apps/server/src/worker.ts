import Redis from "ioredis";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { isUniqueViolation } from "./services/prismaError.js";

// ============================================================
// 비동기 발급 워커 (별도 프로세스)  ← processJob 처리 로직은 직접 구현
// ============================================================
//
// 큐(issue-queue)에서 발급 작업을 하나씩 꺼내 DB에 반영한다.
// 요청(redis-queue 전략)이 이미 Redis 슬롯을 선점했으므로, 워커는 재고 검사 없이
// 쿠폰을 생성하기만 하면 된다. 단, 같은 유저 중복(P2002)은 여기서 걸러 슬롯을 반납한다.
//
// 실행: npm run worker  (서버와 별개로 띄워야 발급이 실제로 처리됨)

const QUEUE_KEY = "issue-queue"; // 요청 측(issue.redisQueue.ts)과 동일해야 함
const redis = new Redis(config.redisUrl);

interface IssueJob {
  campaignId: string;
  userKey: string;
}

// 작업 1건 처리 — 직접 구현할 부분.
// 힌트:
//   1) prisma.coupon.create({ data: { campaignId, userKey } })
//   2) prisma.campaign.update({ where:{id:campaignId}, data:{ issuedCount:{increment:1} } })
//   3) create가 unique 위반(P2002)이면 = 이미 발급 → 선점했던 슬롯을 되돌린다:
//        await redis.incr(`campaign:${job.campaignId}:stock`)
//      그 외 에러는 isUniqueViolation로 걸러 다시 throw (로그에 드러나게).
async function processJob(job: IssueJob): Promise<void> {
  void prisma;
  void isUniqueViolation;
  void redis;
  // TODO: 위 힌트대로 구현
  // throw new Error('processJob 미구현 — 직접 작성하세요');
  try {
    await prisma.coupon.create({
      data: { campaignId: job.campaignId, userKey: job.userKey },
    });
    await prisma.campaign.update({
      where: { id: job.campaignId },
      data: { issuedCount: { increment: 1 } },
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    await redis.incr(`campaign:${job.campaignId}:stock`);
  }
}

// ── 아래 루프/종료는 스캐폴딩(수정 불필요) ──
let running = true;

async function main() {
  console.log(`👷 worker started, waiting on queue '${QUEUE_KEY}'...`);
  while (running) {
    // 5초 블로킹 팝. 작업 없으면 null 반환 → 루프 계속(종료 플래그 확인용).
    const popped = await redis.brpop(QUEUE_KEY, 5);
    if (!popped) continue;

    const [, payload] = popped;
    try {
      const job = JSON.parse(payload) as IssueJob;
      await processJob(job);
    } catch (e) {
      console.error("[worker] job failed:", e);
    }
  }
}

async function shutdown(signal: string) {
  console.log(`\n${signal} received, worker shutting down...`);
  running = false;
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
