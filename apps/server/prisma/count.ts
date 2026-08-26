import { PrismaClient } from '@prisma/client';

// 발급 결과를 한눈에 보는 검증 헬퍼.
// 셸 따옴표 싸움 없이 `npm run count` 로 실행.
//   CAMPAIGN_ID 로 대상 변경 가능 (기본 demo-campaign)
const prisma = new PrismaClient();
const CAMPAIGN_ID = process.env.CAMPAIGN_ID ?? 'demo-campaign';

async function main() {
  const campaign = await prisma.campaign.findUnique({
    where: { id: CAMPAIGN_ID },
  });
  const coupons = await prisma.coupon.count({
    where: { campaignId: CAMPAIGN_ID },
  });

  if (!campaign) {
    console.log(`campaign '${CAMPAIGN_ID}' 없음 — 먼저 npm run seed`);
    return;
  }

  const over = coupons - campaign.totalStock;
  console.log('─────────────────────────────');
  console.log(` campaign     : ${campaign.name} (${CAMPAIGN_ID})`);
  console.log(` totalStock   : ${campaign.totalStock}`);
  console.log(` issuedCount  : ${campaign.issuedCount}`);
  console.log(` 실제 쿠폰 수 : ${coupons}`);
  console.log('─────────────────────────────');
  if (over > 0) {
    console.log(` ❌ 초과 발급 ${over}개 (경쟁 조건 발생)`);
  } else if (coupons === campaign.totalStock) {
    console.log(' ✅ 정확히 재고만큼 발급 (초과 0)');
  } else {
    console.log(` ⚠️ 재고 미달 발급 (남은 ${campaign.totalStock - coupons}개)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
