import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// PrismaClient를 Nest DI 프로바이더로 감싼다.
// - Express에선 db.ts의 전역 싱글턴이었지만, Nest는 DI 컨테이너가 생명주기를 관리한다
//   (Spring의 @Bean/@Service와 동일한 개념).
// - OnModuleInit/OnModuleDestroy로 커넥션 연결/해제 (Spring의 @PostConstruct/@PreDestroy).
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
