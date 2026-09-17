import { Prisma } from '@prisma/client';

// unique 제약 위반(P2002) 판별 — Express의 services/prismaError.ts와 동일.
export function isUniqueViolation(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
  );
}
