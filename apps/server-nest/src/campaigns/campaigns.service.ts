import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

// @Injectable() = 이 클래스를 DI 컨테이너가 관리하는 프로바이더로 등록 (Spring의 @Service).
@Injectable()
export class CampaignsService {
  // 생성자 주입 — PrismaService가 자동으로 주입된다 (Spring 생성자 주입과 동일).
  constructor(private readonly prisma: PrismaService) {}

  // 캠페인 목록 + remaining. (Express의 GET /api/campaigns 로직과 같은 내용)
  async list() {
    // TODO(직접 구현):
    const campaigns = await this.prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
    });
    return campaigns.map((c) => ({
      ...c,
      remaining: c.totalStock - c.issuedCount,
    }));
    // throw new Error('CampaignsService.list 미구현 — 직접 작성하세요');
  }

  // 캠페인 생성 (관리자 전용 라우트에서 호출). Express의 POST /api/campaigns 로직.
  create(name: string, totalStock: number) {
    return this.prisma.campaign.create({ data: { name, totalStock } });
  }
}
