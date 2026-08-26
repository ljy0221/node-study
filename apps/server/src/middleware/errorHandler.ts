import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

// 도메인 에러: 상태코드를 실어 던진다.
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// 공통 에러 핸들러 (Express 4: 인자 4개여야 에러 미들웨어로 인식)
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'ValidationError', details: err.issues });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'InternalServerError' });
}

// async 라우트 핸들러의 reject를 next로 넘겨주는 래퍼
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
