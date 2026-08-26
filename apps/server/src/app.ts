import cors from 'cors';
import express from 'express';
import { campaignsRouter } from './routes/campaigns.js';
import { errorHandler } from './middleware/errorHandler.js';
import { listStrategies } from './services/registry.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true, strategies: listStrategies() });
  });

  app.use('/api/campaigns', campaignsRouter);

  // 에러 핸들러는 항상 라우트 뒤, 마지막에.
  app.use(errorHandler);

  return app;
}
