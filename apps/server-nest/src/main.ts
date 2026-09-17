import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Nest 앱 부트스트랩. Express 버전(4000)과 공존하도록 4001 포트 사용.
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(); // 프론트/외부 호출 허용 (Express의 cors()에 해당)
  const port = Number(process.env.NEST_PORT ?? 4001);
  await app.listen(port);
  console.log(`🐈 NestJS server listening on http://localhost:${port}`);
}

void bootstrap();
