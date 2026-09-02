import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

// 동시성 실험용 시드/리셋 스크립트.
// 매 실행마다 쿠폰을 비우고, 재고 100짜리 캠페인을 고정 id로 재생성한다.
// 고정 id 덕분에 부하테스트 스크립트가 같은 대상을 반복해서 때릴 수 있다.
// Stage 4: Redis 재고 카운터도 함께 초기화한다(redis 전략이 이 키를 DECR).
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

const CAMPAIGN_ID = 'demo-campaign';
const STOCK = Number(process.env.SEED_STOCK ?? 100);

// redis 전략과 반드시 동일한 키를 사용해야 한다: campaign:{id}:stock
const stockKey = `campaign:${CAMPAIGN_ID}:stock`;

async function main() {
  await prisma.coupon.deleteMany({ where: { campaignId: CAMPAIGN_ID } });
  await prisma.campaign.upsert({
    where: { id: CAMPAIGN_ID },
    create: {
      id: CAMPAIGN_ID,
      name: '선착순 데모 쿠폰',
      totalStock: STOCK,
      issuedCount: 0,
      version: 0,
    },
    update: {
      totalStock: STOCK,
      issuedCount: 0,
      version: 0,
    },
  });

  // Redis 재고 카운터를 totalStock으로 리셋
  await redis.set(stockKey, STOCK);
  // 비동기 큐도 비운다 — 큐는 DB와 독립된 저장소라, 안 비우면 이전 실행의
  // 잔여 작업이 다음 실행과 섞여 카운터가 꼬인다(초과/누수의 원인).
  await redis.del('issue-queue');

  console.log(`seeded campaign '${CAMPAIGN_ID}' with stock=${STOCK} (redis ${stockKey}=${STOCK}, queue cleared)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });
