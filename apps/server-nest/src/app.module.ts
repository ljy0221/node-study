import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { CampaignsModule } from './campaigns/campaigns.module';

// 루트 모듈 — Spring의 메인 설정 클래스에 해당. 여기서 하위 모듈을 조립한다.
@Module({
  imports: [PrismaModule, RedisModule, CampaignsModule],
  controllers: [AppController],
})
export class AppModule {}
