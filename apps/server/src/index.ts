import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { redis } from './redis.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`🚀 server listening on http://localhost:${config.port}`);
});

// 정상 종료: 커넥션 정리
async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  server.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
