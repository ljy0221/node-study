import { PrismaClient } from '@prisma/client';

// 동시성 실험용 시드/리셋 스크립트.
// 매 실행마다 쿠폰을 비우고, 재고 100짜리 캠페인을 고정 id로 재생성한다.
// 고정 id 덕분에 부하테스트 스크립트가 같은 대상을 반복해서 때릴 수 있다.
const prisma = new PrismaClient();

const CAMPAIGN_ID = 'demo-campaign';
const STOCK = Number(process.env.SEED_STOCK ?? 100);

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
  console.log(`seeded campaign '${CAMPAIGN_ID}' with stock=${STOCK}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
