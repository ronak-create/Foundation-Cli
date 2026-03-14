import type { PluginDefinition } from "@systemlabs/foundation-plugin-sdk";

const OAUTH_CONFIG_TS = `import { config } from "dotenv";

config();

export const OAUTH_CONFIG = {
  google: {
    clientId:     process.env["GOOGLE_CLIENT_ID"]!,
    clientSecret: process.env["GOOGLE_CLIENT_SECRET"]!,
    redirectUri:  process.env["GOOGLE_REDIRECT_URI"] ?? "http://localhost:3001/auth/google/callback",
  },
  github: {
    clientId:     process.env["GITHUB_CLIENT_ID"]!,
    clientSecret: process.env["GITHUB_CLIENT_SECRET"]!,
    redirectUri:  process.env["GITHUB_REDIRECT_URI"] ?? "http://localhost:3001/auth/github/callback",
  },
  session: {
    secret:  process.env["SESSION_SECRET"] ?? "change-me",
    maxAge:  7 * 24 * 60 * 60 * 1000, // 7 days
  },
} as const;
`;

const OAUTH_ROUTER_TS = `import { Router } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { OAUTH_CONFIG } from "./oauth.config.js";

export const oauthRouter = Router();

passport.use(
  new GoogleStrategy(
    {
      clientID:     OAUTH_CONFIG.google.clientId,
      clientSecret: OAUTH_CONFIG.google.clientSecret,
      callbackURL:  OAUTH_CONFIG.google.redirectUri,
    },
    (_accessToken, _refreshToken, profile, done) => {
      // TODO: upsert user in DB using profile.id and profile.emails?.[0]?.value
      done(null, profile);
    },
  ),
);

passport.use(
  new GitHubStrategy(
    {
      clientID:     OAUTH_CONFIG.github.clientId,
      clientSecret: OAUTH_CONFIG.github.clientSecret,
      callbackURL:  OAUTH_CONFIG.github.redirectUri,
    },
    (_accessToken: string, _refreshToken: string, profile: Express.User, done: (err: null, user: Express.User) => void) => {
      // TODO: upsert user in DB using profile.id
      done(null, profile);
    },
  ),
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user as Express.User));

// Google routes
oauthRouter.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
oauthRouter.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (_req, res) => res.redirect("/"),
);

// GitHub routes
oauthRouter.get("/auth/github", passport.authenticate("github", { scope: ["user:email"] }));
oauthRouter.get(
  "/auth/github/callback",
  passport.authenticate("github", { failureRedirect: "/login" }),
  (_req, res) => res.redirect("/"),
);

oauthRouter.post("/auth/logout", (req, res) => {
  req.logout(() => res.json({ message: "Logged out" }));
});
`;

export const oauthModule: PluginDefinition = {
  manifest: {
    id: "auth-oauth",
    name: "OAuth (Google + GitHub)",
    version: "1.0.0",
    description: "Passport.js OAuth2 with Google and GitHub providers, session-backed",
    category: "auth",
    dependencies: [
      { name: "passport", version: "^0.7.0", scope: "dependencies" },
      { name: "passport-google-oauth20", version: "^2.0.0", scope: "dependencies" },
      { name: "passport-github2", version: "^0.1.12", scope: "dependencies" },
      { name: "express-session", version: "^1.18.0", scope: "dependencies" },
      { name: "dotenv", version: "^16.4.5", scope: "dependencies" },
      { name: "@types/passport", version: "^1.0.16", scope: "devDependencies" },
      { name: "@types/passport-google-oauth20", version: "^2.0.14", scope: "devDependencies" },
      { name: "@types/passport-github2", version: "^1.2.9", scope: "devDependencies" },
      { name: "@types/express-session", version: "^1.17.10", scope: "devDependencies" },
    ],
    files: [
      { relativePath: "src/auth/oauth.config.ts", content: OAUTH_CONFIG_TS },
      { relativePath: "src/auth/oauth.router.ts", content: OAUTH_ROUTER_TS },
    ],
    configPatches: [
      {
        targetFile: ".env.example",
        merge: {
          GOOGLE_CLIENT_ID: "your-google-client-id",
          GOOGLE_CLIENT_SECRET: "your-google-client-secret",
          GOOGLE_REDIRECT_URI: "http://localhost:3001/auth/google/callback",
          GITHUB_CLIENT_ID: "your-github-client-id",
          GITHUB_CLIENT_SECRET: "your-github-client-secret",
          GITHUB_REDIRECT_URI: "http://localhost:3001/auth/github/callback",
          SESSION_SECRET: "change-me-to-a-long-random-secret",
        },
      },
    ],
    compatibility: {
      conflicts: ["auth-jwt", "auth-session", "auth-clerk", "auth-auth0"],
    },
  },
};
