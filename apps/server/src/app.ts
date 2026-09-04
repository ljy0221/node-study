import cors from 'cors';
import express from 'express';
import { authRouter } from './routes/auth.js';
import { campaignsRouter } from './routes/campaigns.js';
import { couponsRouter } from './routes/coupons.js';
import { errorHandler } from './middleware/errorHandler.js';
import { listStrategies } from './services/registry.js';

export function createApp() {
  const app = express();

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
