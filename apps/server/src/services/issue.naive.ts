import { prisma } from '../db.js';
import { HttpError } from '../middleware/errorHandler.js';
import type { IssueResult, IssueStrategy } from './types.js';

// ⚠️ 의도적으로 취약한 나이브 전략 (Stage 2에서 경쟁 조건 재현용).
//
// read → (await 경계) → check → (await 경계) → insert
// 여러 요청이 이 await 사이사이에 인터리빙되면서 issuedCount를 함께 초과 증가시킨다.
// 단일 스레드인 Node에서도 "동기 코드 사이의 await"가 양보 지점이 되어 경쟁이 발생한다.
// → 이것이 이 프로젝트가 보여주려는 핵심 현상이다.
export const naiveStrategy: IssueStrategy = {
  name: 'naive',

  async issue(campaignId: string, userKey: string): Promise<IssueResult> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw new HttpError(404, 'Campaign not found');
    }

    // 재고 검사 — 여기서 읽은 값은 곧 낡는다(stale).
    if (campaign.issuedCount >= campaign.totalStock) {
      return { ok: false, reason: 'SOLD_OUT' };
    }

    // 검사와 쓰기가 원자적이지 않다 → 초과 발급 가능.
    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: { issuedCount: { increment: 1 } },
    });

    try {
      const coupon = await prisma.coupon.create({
        data: { campaignId, userKey },
      });
      return { ok: true, couponId: coupon.id };
    } catch {
      // (campaignId, userKey) unique 위반 = 이미 발급받음. 카운트 롤백.
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { issuedCount: { decrement: 1 } },
      });
      void updated;
      return { ok: false, reason: 'ALREADY_ISSUED' };
    }
  },
};
