import { prisma } from "../db.js";
import { HttpError } from "../middleware/errorHandler.js";
import { isUniqueViolation } from "./prismaError.js";
import type { IssueResult, IssueStrategy } from "./types.js";

// 원자적 조건부 UPDATE 전략.
// 검사와 증가를 단일 UPDATE 문으로 원자화해 naive의 read-check-write 틈을 없앤다.
// Prisma where는 "컬럼 < 컬럼"(issuedCount < totalStock) 비교를 못 하므로 $executeRaw 사용
// ($executeRaw는 영향받은 행 수를 반환 → 1이면 성공, 0이면 품절).
export const atomicStrategy: IssueStrategy = {
  name: "atomic",

  async issue(campaignId: string, userKey: string): Promise<IssueResult> {
    const exists = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });
    if (!exists) throw new HttpError(404, "Campaign not found");

    // 검사와 증가를 원자적 조건부 UPDATE 한 문장으로 처리.
    // affected: 1이면 재고 선점 성공, 0이면 품절.
    const affected = await prisma.$executeRaw`
      UPDATE "Campaign"
      SET "issuedCount" = "issuedCount" + 1
      WHERE "id" = ${campaignId} AND "issuedCount" < "totalStock"
    `;
    if (affected === 0) {
      return { ok: false, reason: "SOLD_OUT" };
    }

    try {
      const coupon = await prisma.coupon.create({
        data: { campaignId, userKey },
      });
      return { ok: true, couponId: coupon.id };
    } catch (error) {
      // 쿠폰 생성 실패 → 방금 선점한 재고를 되돌린다.
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { issuedCount: { decrement: 1 } },
      });

      if (!isUniqueViolation(error)) throw error;

      return { ok: false, reason: "ALREADY_ISSUED" };
    }
  },
};
