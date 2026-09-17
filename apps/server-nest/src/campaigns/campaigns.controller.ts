import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CampaignsService } from "./campaigns.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../auth/admin.guard";

// @Controller('api/campaigns') = 이 컨트롤러의 라우트 접두사 (Spring의 @RequestMapping).
// Express처럼 app.use()로 라우터를 꽂는 대신, 데코레이터로 선언한다.
@Controller("api/campaigns")
export class CampaignsController {
  // 서비스 주입 (컨트롤러는 HTTP만, 로직은 서비스에 위임 — 관심사 분리)
  constructor(private readonly campaigns: CampaignsService) {}

  // @Get() = GET /api/campaigns  (Express의 campaignsRouter.get('/', ...)에 해당)
  @Get()
  async list() {
    return { campaigns: await this.campaigns.list() };
    // (Nest는 반환값을 자동으로 JSON 응답으로 만들어 준다 — res.json 직접 호출 불필요)
  }

  // POST /api/campaigns — 관리자 전용 (가드 데모용).
  // @UseGuards(JwtAuthGuard, AdminGuard) = Express의 [requireAuth, requireAdmin] 체인.
  // ⚠️ 두 가드의 canActivate는 아직 스텁(미구현) — 다음 세션에 채우면 이 라우트가 살아난다.
  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async create(@Body() body: { name: string; totalStock: number }) {
    return this.campaigns.create(body.name, body.totalStock);
  }
}
