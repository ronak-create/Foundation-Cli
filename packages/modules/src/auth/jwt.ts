import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const AUTH_SERVICE_TS = `import jwt from "jsonwebtoken";
import { config } from "dotenv";

config();

const JWT_SECRET = process.env["JWT_SECRET"];
const JWT_EXPIRES_IN = process.env["JWT_EXPIRES_IN"] ?? "7d";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

export interface TokenPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export function signToken(payload: Omit<TokenPayload, "iat" | "exp">): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: JWT_EXPIRES_IN as any });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET!) as TokenPayload;
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
}
`;

const AUTH_MIDDLEWARE_TS = `import type { Request, Response, NextFunction } from "express";
import { verifyToken, type TokenPayload } from "./auth.service.js";

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers["authorization"];

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }
    const userRole = (req.user as TokenPayload & { role?: string }).role;
    if (userRole !== role) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
`;

const AUTH_ROUTER_TS = `import { Router, type Request, type Response } from "express";
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
`;

// const ENV_EXAMPLE = `# JWT Auth
// JWT_SECRET=change-me-to-a-long-random-secret-in-production
// JWT_EXPIRES_IN=7d
// `;

export const jwtModule: PluginDefinition = {
  manifest: {
    id: "auth-jwt",
    name: "JWT Authentication",
    version: "1.0.0",
    description: "JSON Web Token authentication with sign/verify utilities and Express middleware",
    category: "auth",
    dependencies: [
      { name: "jsonwebtoken", version: "^9.0.2", scope: "dependencies" },
      { name: "dotenv", version: "^16.4.5", scope: "dependencies" },
      { name: "@types/jsonwebtoken", version: "^9.0.6", scope: "devDependencies" },
    ],
    files: [
      { relativePath: "src/auth/auth.service.ts", content: AUTH_SERVICE_TS },
      { relativePath: "src/auth/auth.middleware.ts", content: AUTH_MIDDLEWARE_TS },
      { relativePath: "src/auth/auth.router.ts", content: AUTH_ROUTER_TS },
    ],
    configPatches: [
      {
        targetFile: ".env.example",
        merge: {
          JWT_SECRET: "change-me-to-a-long-random-secret-in-production",
          JWT_EXPIRES_IN: "7d",
        },
      },
    ],
    compatibility: {
      conflicts: ["auth-session", "auth-oauth"],
    },
  },
};
