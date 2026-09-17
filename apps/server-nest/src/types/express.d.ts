// Express Request에 req.user 타입 추가 (가드가 채워 넣는 값).
// verifyToken이 반환하는 JwtPayload 형태와 맞춘다: { sub, email, role }.
declare global {
  namespace Express {
    interface Request {
      user?: { sub: string; email: string; role: 'USER' | 'ADMIN' };
    }
  }
}

export {};
