import type { PluginDefinition } from "@systemlabs/foundation-plugin-sdk";

const CLERK_MIDDLEWARE_TS = `import { clerkMiddleware, getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

export { clerkMiddleware };

export function requireClerkAuth(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }
  next();
}
`;

const CLERK_ROUTER_TS = `import { Router, type Request, type Response } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { requireClerkAuth } from "./clerk.middleware.js";

export const clerkRouter = Router();

clerkRouter.get("/auth/me", requireClerkAuth, async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const user = await clerkClient.users.getUser(userId!);
  res.json({
    id:    user.id,
    email: user.emailAddresses[0]?.emailAddress,
    name:  \`\${user.firstName ?? ""} \${user.lastName ?? ""}\`.trim(),
  });
});
`;

const CLERK_CLIENT_TSX = `"use client";

import { ClerkProvider, SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import type { ReactNode } from "react";

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <header className="flex justify-end p-4 border-b">
        <SignedOut>
          <SignInButton />
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </header>
      {children}
    </ClerkProvider>
  );
}
`;

export const clerkModule: PluginDefinition = {
  manifest: {
    id: "auth-clerk",
    name: "Clerk",
    version: "1.0.0",
    description: "Clerk authentication with Express middleware and Next.js ClerkProvider",
    category: "auth",
    dependencies: [
      { name: "@clerk/express", version: "^1.2.1", scope: "dependencies" },
      { name: "@clerk/nextjs", version: "^5.2.1", scope: "dependencies" },
    ],
    files: [
      { relativePath: "src/auth/clerk.middleware.ts", content: CLERK_MIDDLEWARE_TS },
      { relativePath: "src/auth/clerk.router.ts", content: CLERK_ROUTER_TS },
      { relativePath: "src/components/AuthProvider.tsx", content: CLERK_CLIENT_TSX },
    ],
    configPatches: [
      {
        targetFile: ".env.example",
        merge: {
          CLERK_PUBLISHABLE_KEY: "pk_test_...",
          CLERK_SECRET_KEY: "sk_test_...",
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_...",
          NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
          NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
        },
      },
    ],
    compatibility: {
      conflicts: ["auth-jwt", "auth-oauth", "auth-session", "auth-auth0"],
    },
  },
};
