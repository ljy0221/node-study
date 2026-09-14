import type { Request } from "express";
import { redis } from "../redis.js";
import { HttpError, asyncHandler } from "./errorHandler.js";

// ============================================================
// 레이트 리밋 미들웨어 (Redis 고정 윈도우)  ← Redis 로직은 직접 구현
// ============================================================
//
// 아이디어: 식별자(IP 등)별로 "이번 윈도우에 몇 번 요청했나"를 Redis 카운터로 센다.
//   - 첫 요청에 카운터를 만들고 TTL(윈도우)을 건다 → 윈도우가 지나면 자동 리셋.
//   - 카운터가 limit을 넘으면 429로 거절.
// Stage 4에서 쓴 redis.incr / expire 를 그대로 활용(복습).
//
// 사용 예: authRouter.post('/login', rateLimit({ keyPrefix:'login', limit:5, windowSec:60 }), handler)

interface RateLimitOptions {
  keyPrefix: string; // 용도 구분 (예: 'login')
  limit: number; // 윈도우당 허용 횟수
  windowSec: number; // 윈도우 길이(초)
  keyFn?: (req: Request) => string; // 식별자 추출 (기본: IP)
}

export function rateLimit(opts: RateLimitOptions) {
  // asyncHandler로 감싸 async throw가 errorHandler로 가게 한다(미들웨어에도 적용됨).
  return asyncHandler(async (req, _res, next) => {
    const id = opts.keyFn ? opts.keyFn(req) : (req.ip ?? "unknown");
    const key = `ratelimit:${opts.keyPrefix}:${id}`;

    // 고정 윈도우: 첫 요청에만 TTL을 걸어 windowSec 뒤 카운터가 자동 리셋되게 한다.
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, opts.windowSec);
    if (count > opts.limit)
      throw new HttpError(
        429,
        "요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
      );
    next();
  });
}
