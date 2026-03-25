import { Router, type Request, type Response } from "express";
import { signToken } from "./auth.service.js";

export const authRouter = Router();

authRouter.post("/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  // TODO: replace with real user lookup + bcrypt comparison
  if (password !== "demo") {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken({ userId: "demo-user-id", email });
  res.json({ token, expiresIn: process.env["JWT_EXPIRES_IN"] ?? "7d" });
});

authRouter.post("/auth/logout", (_req: Request, res: Response) => {
  // JWT is stateless — client discards token.
  res.json({ message: "Logged out successfully" });
});
