import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { hashPassword, signToken, verifyPassword } from "../auth.js";
import { HttpError, asyncHandler } from "../middleware/errorHandler.js";
import { isUniqueViolation } from "../services/prismaError.js";

export const authRouter = Router();

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// POST /api/auth/register
// 흐름(직접 구현):
//   1) credsSchema.parse(req.body)
//   2) hashPassword(password)
//   3) prisma.user.create({ data: { email, passwordHash } })
//      - 이메일 중복(P2002)이면 isUniqueViolation로 잡아 409 (HttpError)
//   4) signToken({ sub: user.id, email }) → res.status(201).json({ token })
authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    try {
      const { email, password } = credsSchema.parse(req.body);
      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: { email, passwordHash },
      });

      const token = signToken({
        sub: user.id,
        email: user.email,
        role: user.role,
      });

      return res.status(201).json({ token });
    } catch (e) {
      if (isUniqueViolation(e))
        throw new HttpError(409, "이미 가입된 이메일입니다");
      throw e;
    }
  }),
);

// POST /api/auth/login
// 흐름(직접 구현):
//   1) credsSchema.parse(req.body)
//   2) prisma.user.findUnique({ where: { email } })
//   3) 없거나 verifyPassword 불일치 → 401 (자격증명 노출 방지 위해 메시지는 뭉뚱그림)
//   4) signToken(...) → res.json({ token })
authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = credsSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await verifyPassword(password, user.passwordHash)))
      throw new HttpError(401, "이메일 또는 비밀번호가 올바르지 않습니다");

    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return res.json({ token });
  }),
);
