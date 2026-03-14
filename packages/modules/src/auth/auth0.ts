import type { PluginDefinition } from "@systemlabs/foundation-plugin-sdk";

const AUTH0_CONFIG_TS = `import { config } from "dotenv";

config();

export const AUTH0_CONFIG = {
  domain:       process.env["AUTH0_DOMAIN"]!,
  clientId:     process.env["AUTH0_CLIENT_ID"]!,
  clientSecret: process.env["AUTH0_CLIENT_SECRET"]!,
  audience:     process.env["AUTH0_AUDIENCE"]!,
  issuerBaseUrl: \`https://\${process.env["AUTH0_DOMAIN"]}\`,
} as const;
`;

const AUTH0_MIDDLEWARE_TS = `import { auth } from "express-oauth2-jwt-bearer";
import { AUTH0_CONFIG } from "./auth0.config.js";
import type { Request, Response, NextFunction } from "express";

/** Validates Auth0 JWT Bearer tokens on protected routes. */
export const checkAuth0JWT = auth({
  audience: AUTH0_CONFIG.audience,
  issuerBaseURL: AUTH0_CONFIG.issuerBaseUrl,
  tokenSigningAlg: "RS256",
});

/** Convenience wrapper that returns 401 JSON on failure. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  checkAuth0JWT(req, res, (err) => {
    if (err) {
      res.status(401).json({ error: "Invalid or missing token" });
      return;
    }
    next();
  });
}
`;

const AUTH0_ROUTER_TS = `import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth0.middleware.js";

export const auth0Router = Router();

auth0Router.get("/auth/me", requireAuth, (req: Request, res: Response) => {
  // req.auth is populated by express-oauth2-jwt-bearer
  res.json({ auth: (req as unknown as { auth: unknown }).auth });
});
`;

const AUTH0_PROVIDER_TSX = `"use client";

import { Auth0Provider } from "@auth0/auth0-react";
import type { ReactNode } from "react";

const domain   = process.env["NEXT_PUBLIC_AUTH0_DOMAIN"]!;
const clientId = process.env["NEXT_PUBLIC_AUTH0_CLIENT_ID"]!;

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{ redirect_uri: typeof window !== "undefined" ? window.location.origin : "" }}
    >
      {children}
    </Auth0Provider>
  );
}
`;

export const auth0Module: PluginDefinition = {
  manifest: {
    id: "auth-auth0",
    name: "Auth0",
    version: "1.0.0",
    description: "Auth0 JWT validation middleware for Express and Auth0Provider for Next.js",
    category: "auth",
    dependencies: [
      { name: "express-oauth2-jwt-bearer", version: "^1.6.0", scope: "dependencies" },
      { name: "@auth0/auth0-react", version: "^2.2.4", scope: "dependencies" },
    ],
    files: [
      { relativePath: "src/auth/auth0.config.ts", content: AUTH0_CONFIG_TS },
      { relativePath: "src/auth/auth0.middleware.ts", content: AUTH0_MIDDLEWARE_TS },
      { relativePath: "src/auth/auth0.router.ts", content: AUTH0_ROUTER_TS },
      { relativePath: "src/components/AuthProvider.tsx", content: AUTH0_PROVIDER_TSX },
    ],
    configPatches: [
      {
        targetFile: ".env.example",
        merge: {
          AUTH0_DOMAIN: "your-tenant.auth0.com",
          AUTH0_CLIENT_ID: "your-client-id",
          AUTH0_CLIENT_SECRET: "your-client-secret",
          AUTH0_AUDIENCE: "https://your-api-identifier",
          NEXT_PUBLIC_AUTH0_DOMAIN: "your-tenant.auth0.com",
          NEXT_PUBLIC_AUTH0_CLIENT_ID: "your-client-id",
        },
      },
    ],
    compatibility: {
      conflicts: ["auth-jwt", "auth-oauth", "auth-session", "auth-clerk"],
    },
  },
};
