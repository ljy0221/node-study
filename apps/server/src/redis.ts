import Redis from 'ioredis';
import { config } from './config.js';

// ioredis 싱글턴. db.ts와 같은 이유로 globalThis에 캐싱.
const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(config.redisUrl, {
    // 부하테스트 시 커넥션이 몰려도 조용히 재시도
    maxRetriesPerRequest: null,
    lazyConnect: false,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}
