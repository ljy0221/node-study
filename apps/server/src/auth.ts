import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

// ============================================================
// 인증 헬퍼 (비밀번호 해싱 + JWT)  ← 본문은 직접 구현
// ============================================================
//
// Spring 개발자용 매핑:
//   bcrypt.hash/compare  ≈  BCryptPasswordEncoder.encode/matches
//   jwt.sign/verify      ≈  JWT 라이브러리(jjwt 등)의 서명/검증
//   config.jwtSecret     ≈  application.yml 의 jwt.secret

export interface JwtPayload {
  sub: string; // user id
  email: string;
}

// 비밀번호를 해시한다. (평문은 절대 DB에 저장하지 않는다)
// 힌트: return bcrypt.hash(plain, 10)   // 10 = salt rounds
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

// 평문과 해시가 일치하는지 검사.
// 힌트: return bcrypt.compare(plain, hash)
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// JWT 발급. 페이로드에 유저 식별자를 담고 유효기간을 준다.
// 힌트: return jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' })
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "1h" });
}

// JWT 검증. 유효하면 페이로드 반환, 아니면 throw (jwt.verify가 알아서 throw).
// 힌트: return jwt.verify(token, config.jwtSecret) as JwtPayload
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
}
