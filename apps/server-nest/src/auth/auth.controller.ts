import {
  Body,
  ConflictException,
  Controller,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { isUniqueViolation } from "../common/prisma-error";
import { AuthService } from "./auth.service";

// 요청 body 타입. (Nest 정석은 class-validator DTO + ValidationPipe지만,
//  여기선 마이그레이션 비교를 단순히 하려고 타입만 둔다 — 검증 강화는 후속 과제)
interface CredsDto {
  email: string;
  password: string;
}

@Controller("api/auth")
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  // @Post('register') = POST /api/auth/register, @Body()로 요청 본문 주입(Express req.body)
  @Post("register")
  async register(@Body() body: CredsDto) {
    // TODO(직접 구현): Express routes/auth.ts의 register 로직을 Nest로 옮기기
    //   1) const passwordHash = await this.auth.hashPassword(body.password)
    //   2) try { const user = await this.prisma.user.create({ data: { email: body.email, passwordHash } }) }
    //      catch (e) { if (isUniqueViolation(e)) throw new ConflictException('이미 가입된 이메일입니다'); throw e; }
    //   3) const token = this.auth.signToken({ sub: user.id, email: user.email, role: user.role })
    //   4) return { token }   // Nest가 JSON으로 직렬화
    // 참고: Express의 HttpError(409) 대신 Nest 내장 ConflictException을 쓴다(자동 409).
    void body;
    const passwordHash = await this.auth.hashPassword(body.password);
    try {
      const user = await this.prisma.user.create({
        data: { email: body.email, passwordHash },
      });
      const token = this.auth.signToken({
        sub: user.id,
        email: user.email,
        role: user.role,
      });
      return { token };
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException("이미 가입된 이메일 입니다.");
      throw e;
    }
    // throw new Error('register 미구현 — 직접 작성하세요');
  }

  // @Post('login') = POST /api/auth/login
  @Post("login")
  async login(@Body() body: CredsDto) {
    // TODO(직접 구현):
    //   1) const user = await this.prisma.user.findUnique({ where: { email: body.email } })
    //   2) if (!user || !(await this.auth.verifyPassword(body.password, user.passwordHash)))
    //        throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다')  // 자동 401
    //   3) return { token: this.auth.signToken({ sub: user.id, email: user.email, role: user.role }) }
    void body;
    void UnauthorizedException;
    const user = await this.prisma.user.findUnique({
      where: { email: body.email },
    });
    if (
      !user ||
      !(await this.auth.verifyPassword(body.password, user.passwordHash))
    )
      throw new UnauthorizedException(
        "이메일 또는 비밀번호가 올바르지 않습니다.",
      );
    return {
      token: this.auth.signToken({
        sub: user.id,
        email: user.email,
        role: user.role,
      }),
    };
    // throw new Error("login 미구현 — 직접 작성하세요");
  }
}
