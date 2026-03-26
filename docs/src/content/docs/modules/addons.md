---
title: Add-ons
description: Official add-on plugins - Stripe, Redis, OpenAI
---



Official add-on plugins extend Foundation CLI with popular integrations. They install via `foundation add <name>`.

## Available Add-ons

| ID | Install | Key Files | Env Vars |
|----|---------|-----------|----------|
| `plugin-stripe` | `foundation add stripe` | stripe.ts, stripe-webhooks.ts, stripe-types.ts | STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY |
| `plugin-redis` | `foundation add redis` | redis-client.ts, redis-cache.ts | REDIS_URL |
| `plugin-openai` | `foundation add openai` | openai-client.ts, openai-embeddings.ts | OPENAI_API_KEY |

## Stripe (`plugin-stripe`)

Payment processing:
- `src/payments/stripe.ts` — Stripe client singleton with env-key guard
- `src/payments/stripe-webhooks.ts` — Express webhook handler with signature verification
- `src/payments/stripe-types.ts` — Type re-exports

```bash
foundation add stripe
```

Dependencies: `stripe`

## Redis (`plugin-redis`)

In-memory data store:
- `src/lib/redis.ts` — ioredis client with connection helpers

```bash
foundation add redis
```

Dependencies: `ioredis`

## OpenAI (`plugin-openai`)

AI integrations:
- `src/lib/openai.ts` — OpenAI client with typed completions helper

```bash
foundation add openai
```

Dependencies: `openai`

## Community Plugins

Beyond official add-ons, any npm package with `foundation-plugin` keyword can be installed:

```bash
foundation add foundation-plugin-my-plugin
```

See [Plugins Overview](/plugins/overview/) for details.

## Related

- [CLI: add](/cli/add/) — Add modules to projects
- [Plugins Overview](/plugins/overview/) — Plugin ecosystem
- [CLI: search](/cli/search/) — Find community plugins
