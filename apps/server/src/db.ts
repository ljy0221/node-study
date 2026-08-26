import { PrismaClient } from '@prisma/client';

// PrismaClient 싱글턴.
// tsx watch 등으로 모듈이 여러 번 로드될 때 커넥션이 누수되지 않도록
// globalThis에 캐싱한다. (Prisma 공식 권장 패턴)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
