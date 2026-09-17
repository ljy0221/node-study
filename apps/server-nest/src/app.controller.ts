import { Controller, Get } from '@nestjs/common';

// 루트 컨트롤러 — health 체크 (Express의 app.get('/health')에 해당)
@Controller()
export class AppController {
  @Get('health')
  health() {
    return { ok: true, framework: 'nestjs' };
  }
}
