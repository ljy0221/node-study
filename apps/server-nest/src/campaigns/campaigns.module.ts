import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

// 캠페인 기능 모듈 — 컨트롤러(HTTP)와 서비스(로직)를 묶는다.
@Module({
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
