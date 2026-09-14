import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { authRouter } from './routes/auth.js';
import { campaignsRouter } from './routes/campaigns.js';
import { couponsRouter } from './routes/coupons.js';
import { errorHandler } from './middleware/errorHandler.js';
import { listStrategies } from './services/registry.js';

export function createApp() {
  const app = express();

  // 보안 HTTP 헤더 일괄 설정 (가장 먼저 — 모든 응답에 적용되게).
  // X-Content-Type-Options: nosniff (MIME 스니핑 차단),
  // X-Frame-Options: DENY (클릭재킹 차단), X-Powered-By 제거,
  // Strict-Transport-Security(HSTS) 등.
  app.use(helmet());

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true, strategies: listStrategies() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/campaigns', campaignsRouter);
  app.use('/api/coupons', couponsRouter);

  // 에러 핸들러는 항상 라우트 뒤, 마지막에.
  app.use(errorHandler);

  return app;
}
