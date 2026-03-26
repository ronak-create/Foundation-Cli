---
title: Authentication Modules
description: Auth modules - JWT, OAuth, Session, Clerk, Auth0
---



Foundation CLI supports 5 authentication providers. Auth modules are mutually exclusive — only one can be selected.

## Available Modules

| ID | Name | Conflicts With | Key Files |
|----|------|---------------|-----------|
| `auth-jwt` | JWT | session, oauth | auth.service.ts, auth.middleware.ts, auth.router.ts |
| `auth-oauth` | OAuth (Google + GitHub) | jwt, session | oauth.config.ts, oauth.router.ts |
| `auth-session` | Session-based | jwt, oauth | session.config.ts, session.middleware.ts |
| `auth-clerk` | Clerk | all others | clerk.middleware.ts, clerk.router.ts, AuthProvider.tsx |
| `auth-auth0` | Auth0 | all others | auth0.config.ts, auth0.middleware.ts, AuthProvider.tsx |

## JWT (`auth-jwt`)

JSON Web Token authentication:
- `src/auth/auth.service.ts` — JWT sign + verify with refresh tokens
- `src/auth/auth.middleware.ts` — Express middleware (attaches `req.user`)
- `src/auth/auth.router.ts` — `/auth/login`, `/auth/refresh`, `/auth/logout`

Dependencies: `jsonwebtoken`, `@types/jsonwebtoken`

## OAuth (`auth-oauth`)

Passport.js with Google + GitHub:
- `src/auth/oauth.config.ts` — Passport strategy configuration
- `src/auth/oauth.router.ts` — OAuth callback routes

Dependencies: `passport`, `passport-google-oauth20`, `passport-github2`

## Session (`auth-session`)

Cookie-based sessions:
- `src/auth/session.config.ts` — express-session with secure cookies
- `src/auth/session.middleware.ts` — Session middleware mount
- `src/auth/session.router.ts` — Login / logout routes

Dependencies: `express-session`, `connect-pg-simple` (with PostgreSQL)

## Clerk (`auth-clerk`)

Hosted auth by Clerk:
- `src/auth/clerk.middleware.ts` — clerkMiddleware() mount
- `src/auth/clerk.router.ts` — Protected route example
- `src/components/AuthProvider.tsx` — ClerkProvider wrapper

Conflicts with: all other auth modules

## Auth0 (`auth-auth0`)

Hosted auth by Auth0:
- `src/auth/auth0.config.ts` — Auth0 client config
- `src/auth/auth0.middleware.ts` — JWT verification via JWKS
- `src/components/Auth0Provider.tsx` — Auth0Provider wrapper

Conflicts with: all other auth modules

## Related

- [Modules Overview](/modules/overview/) — All categories
- [ORM Modules](/modules/orm/) — Auth integrates with ORM
- [CLI: generate](/cli/generate/) — Generate User model with auth
