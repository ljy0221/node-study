import { redis } from '../redis.js';
import { asyncHandler } from './errorHandler.js';

// ============================================================
// 멱등성 미들웨어 (Idempotency-Key)  ← Redis 조회/저장은 직접 구현
// ============================================================
//
// 클라이언트가 'Idempotency-Key: <고유값>' 헤더를 보내면:
//   - 그 키로 이미 처리한 응답이 Redis에 있으면 → 그대로 재생(replay), 핸들러 재실행 X
//   - 없으면 → 핸들러가 만든 응답을 Redis에 저장(다음 재전송 때 재생용)
// 키가 없으면 멱등성 미적용(그냥 통과).
//
// res.json을 가로채는 플럼빙은 제공됨. 아래 TODO(A), TODO(B) 두 곳만 채우면 된다.

export function idempotency(opts: { keyPrefix: string; ttlSec: number }) {
  return asyncHandler(async (req, res, next) => {
    const idemKey = req.header('Idempotency-Key');
    if (!idemKey) {
      next(); // 키 없음 → 멱등성 미적용
      return;
    }
    const cacheKey = `idem:${opts.keyPrefix}:${idemKey}`;

    // ── TODO(A): 재생(replay) ──
    // 힌트:
    //   const cached = await redis.get(cacheKey);
    //   if (cached) {
    //     const { status, body } = JSON.parse(cached);
    //     res.status(status).json(body);   // 저장해둔 응답 그대로
    //     return;                          // 핸들러로 안 넘어감(재실행 방지)
    //   }

    const cached = await redis.get(cacheKey);
    if (cached) {
      const {status, body} = JSON.parse(cached);
      res.status(status).json(body);
      return;
    }

    // ── 응답 가로채기 (플럼빙 — 수정 불필요) ──
    // 핸들러가 res.json(body)을 호출하는 순간을 낚아채, 저장 후 원래 동작을 수행한다.
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      // ── TODO(B): 저장(store) ──
      // 힌트: 5xx(서버 에러)는 저장하지 않는다(재시도 가능해야 하므로).
      //   if (res.statusCode < 500) {
      //     void redis.set(cacheKey, JSON.stringify({ status: res.statusCode, body }), 'EX', opts.ttlSec);
      //   }
      if (res.statusCode < 500) {
        void redis.set(cacheKey, JSON.stringify({ status: res.statusCode, body }), 'EX', opts.ttlSec);
      }
      return originalJson(body);
    }) as typeof res.json;

    next();
  });
}
