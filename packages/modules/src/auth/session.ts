import type { PluginDefinition } from "@systemlabs/foundation-plugin-sdk";

const SESSION_CONFIG_TS = `import session from "express-session";
import { config } from "dotenv";

config();

const SESSION_SECRET = process.env["SESSION_SECRET"];

if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

export const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: "lax",
  },
});
`;

const SESSION_MIDDLEWARE_TS = `import type { Request, Response, NextFunction } from "express";

export interface SessionUser {
  id: string;
  email: string;
  role?: string;
}

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.user) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }
  next();
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session.user) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }
    if (req.session.user.role !== role) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
`;

const SESSION_ROUTER_TS = `import { Router, type Request, type Response } from "express";
import type { SessionUser } from "./session.middleware.js";

export const sessionRouter = Router();

sessionRouter.post("/auth/login", async (req: Request, res: Response) => {
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

  const user: SessionUser = { id: "demo-user-id", email };
  req.session.user = user;
  res.json({ message: "Logged in", user });
});

sessionRouter.post("/auth/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Failed to logout" });
      return;
    }
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out" });
  });
});

sessionRouter.get("/auth/me", (req: Request, res: Response) => {
  if (!req.session.user) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }
  res.json({ user: req.session.user });
});
`;

export const sessionModule: PluginDefinition = {
  manifest: {
    id: "auth-session",
    name: "Session-based",
    version: "1.0.0",
    description: "Express session auth with secure cookies, role helpers, and login/logout routes",
    category: "auth",
    dependencies: [
      { name: "express-session", version: "^1.18.0", scope: "dependencies" },
      { name: "dotenv", version: "^16.4.5", scope: "dependencies" },
      { name: "@types/express-session", version: "^1.17.10", scope: "devDependencies" },
    ],
    files: [
      { relativePath: "src/auth/session.config.ts", content: SESSION_CONFIG_TS },
      { relativePath: "src/auth/session.middleware.ts", content: SESSION_MIDDLEWARE_TS },
      { relativePath: "src/auth/session.router.ts", content: SESSION_ROUTER_TS },
    ],
    configPatches: [
      {
        targetFile: ".env.example",
        merge: {
          SESSION_SECRET: "change-me-to-a-long-random-secret",
        },
      },
    ],
    compatibility: {
      conflicts: ["auth-jwt", "auth-oauth", "auth-clerk", "auth-auth0"],
    },
  },
};
