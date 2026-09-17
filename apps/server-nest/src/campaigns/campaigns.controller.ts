import { Controller, Get } from "@nestjs/common";
import { CampaignsService } from "./campaigns.service";

// @Controller('api/campaigns') = 이 컨트롤러의 라우트 접두사 (Spring의 @RequestMapping).
// Express처럼 app.use()로 라우터를 꽂는 대신, 데코레이터로 선언한다.
@Controller("api/campaigns")
export class CampaignsController {
  // 서비스 주입 (컨트롤러는 HTTP만, 로직은 서비스에 위임 — 관심사 분리)
  constructor(private readonly campaigns: CampaignsService) {}

  // @Get() = GET /api/campaigns  (Express의 campaignsRouter.get('/', ...)에 해당)
  @Get()
  async list() {
    // TODO(직접 구현): 서비스 호출해서 { campaigns } 형태로 반환
    return { campaigns: await this.campaigns.list() };
    // (Nest는 반환값을 자동으로 JSON 응답으로 만들어 준다 — res.json 직접 호출 불필요)
    // throw new Error('CampaignsController.list 미구현 — 직접 작성하세요');
  }
}
