import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global(): 이 모듈을 한 번 import하면 PrismaService를 앱 어디서나 주입받을 수 있다.
// (매 모듈마다 import 안 해도 됨 — Spring의 전역 빈과 비슷)
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
