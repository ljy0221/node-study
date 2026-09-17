import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

// ============================================================
// 관리자 인가 가드 (Express의 requireAdmin에 해당)  ← canActivate 직접 구현
// ============================================================
//
// 반드시 JwtAuthGuard 뒤에 온다: @UseGuards(JwtAuthGuard, AdminGuard)
// JwtAuthGuard가 req.user를 채워주므로, 여기선 role만 확인.
// 인증(401)은 JwtAuthGuard가, 인가(403)는 여기서 — Express 때와 같은 층 구분.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    // TODO(직접 구현):
    //   if (req.user?.role !== 'ADMIN') throw new ForbiddenException('관리자 권한 필요'); // 자동 403
    //   return true;
    void req;
    void ForbiddenException;
    throw new ForbiddenException('AdminGuard 미구현 — 직접 작성하세요');
  }
}
