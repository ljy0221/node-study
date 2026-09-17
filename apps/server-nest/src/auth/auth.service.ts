import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: 'USER' | 'ADMIN';
}

// 토큰/해싱 로직 — Express auth.ts와 동일한 내용(참고 제공).
// 차이는 "전역 함수" 대신 "@Injectable 프로바이더"로 감싸 DI로 주입한다는 점.
// (Nest 정석은 @nestjs/jwt지만, 마이그레이션 비교를 위해 같은 라이브러리를 그대로 씀)
@Injectable()
export class AuthService {
  private readonly secret = process.env.JWT_SECRET ?? 'dev-only-change-me';

  hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
  }

  verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  signToken(payload: JwtPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: '1h' });
  }

  verifyToken(token: string): JwtPayload {
    return jwt.verify(token, this.secret) as JwtPayload;
  }
}
