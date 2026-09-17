import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

// ioredis 클라이언트를 Nest 프로바이더로. (Express의 redis.ts 싱글턴에 해당)
// RedisService는 Redis를 상속해 redis.incr(...) 처럼 그대로 쓸 수 있게 한다.
@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor() {
    super(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }

  onModuleDestroy() {
    this.disconnect();
  }
}
