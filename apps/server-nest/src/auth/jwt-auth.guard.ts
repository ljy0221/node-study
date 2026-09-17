import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';

// ============================================================
// 인증 가드 (Express의 requireAuth 미들웨어에 해당)  ← canActivate 직접 구현
// ============================================================
//
// Nest 가드는 CanActivate를 구현하고, true를 반환하면 통과 / throw나 false면 차단.
// Express 미들웨어(req,res,next)와 달리, ExecutionContext에서 요청 객체를 꺼낸다.
//   const req = context.switchToHttp().getRequest<Request>();
// 적용: 컨트롤러/핸들러에 @UseGuards(JwtAuthGuard)
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    // TODO(직접 구현): Express requireAuth 로직을 그대로 옮기기
    //   1) const header = req.headers.authorization;
    //   2) if (!header || !header.startsWith('Bearer ')) throw new UnauthorizedException('인증 필요');
    //   3) const token = header.slice(7);
    //   4) try { req.user = this.auth.verifyToken(token); return true; }
    //      catch { throw new UnauthorizedException('유효하지 않은 토큰'); }
    void req;
    throw new UnauthorizedException('JwtAuthGuard 미구현 — 직접 작성하세요');
  }
}
