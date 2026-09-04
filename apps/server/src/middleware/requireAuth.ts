import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../auth.js";
import { HttpError } from "./errorHandler.js";

// Express Request에 req.user 타입을 추가(전역 확장). ← 이 부분은 스캐폴딩
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
    }
  }
}

// ============================================================
// 인증 미들웨어  ← 본문은 직접 구현
// ============================================================
//
// "Authorization: Bearer <token>" 헤더를 검증해 req.user를 채운다.
// 동기 함수라 throw하면 Express가 알아서 errorHandler로 보낸다(asyncHandler 불필요).
//
// 흐름:
//   1) const header = req.headers.authorization;   // "Bearer eyJ..." 형태
//   2) header가 없거나 "Bearer "로 시작 안 하면 → throw new HttpError(401, '인증 필요')
//   3) const token = header.slice(7);              // "Bearer " 7글자 뒤가 토큰
//   4) try {
//        const payload = verifyToken(token);       // 아까 만든 함수 (만료/위조면 throw)
//        req.user = { id: payload.sub, email: payload.email };
//        next();                                    // 통과 → 다음 핸들러로
//      } catch { throw new HttpError(401, '유효하지 않은 토큰'); }
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    throw new HttpError(401, "인증 필요");

  const token = header.slice(7);
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (e) {
    throw new HttpError(401, "유효하지 않은 토큰");
  }
}

// 선택적 인증: 토큰이 있으면 검증해서 req.user를 채우고, 없으면 그냥 통과(익명 허용).
// 발급 엔드포인트에 쓴다 — 로그인 유저는 유저 id로, 부하테스트는 body userKey로 발급.
// (토큰이 "있는데 유효하지 않으면"은 위조 시도이므로 그대로 401)
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(); // 익명 통과
    return;
  }
  const token = header.slice(7);
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    throw new HttpError(401, '유효하지 않은 토큰');
  }
}
