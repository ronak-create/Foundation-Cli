---
title: Quick Start
description: Get Foundation CLI running in 30 seconds
---



Create a production-ready full-stack project in under 3 minutes.

## One Command

```bash
npx @systemlabs/foundation-cli create my-app
```

That's it. The CLI will prompt you through the project setup.

## Interactive Session

```
? Project name › my-saas-app
? What are you building?
  ❯ SaaS Application
    AI Application
    E-commerce
    API Backend
    Internal Tool
    CRM
    Dashboard

? Frontend  › Next.js
? Backend   › Express
? Database  › PostgreSQL
? ORM       › Prisma
? Auth      › JWT
? UI        › Tailwind CSS
? Deploy    › Docker
```

The resolver validates your selection, resolves dependencies, and scaffolds the project.

## Non-Interactive (CI Mode)

Use a preset for fully automated scaffolding:

```bash
foundation create my-app --preset saas
```

Available presets: `saas`, `ai-app`, `ecommerce`, `api-backend`, `internal-tool`, `crm`, `dashboard`

## What's Generated

After completion, you'll have:

```
my-app/
├── src/                    # Your application code
├── prisma/                 # ORM schema (if using Prisma)
├── app/                    # Next.js pages (if using Next.js)
├── package.json            # All dependencies merged
├── .env.example            # Environment variables template
├── docker-compose.yml      # Local development stack
└── .foundation/            # Project state (do not edit)
```

## Start Development

```bash
cd my-app
npm run dev
```

Your app is now running with:
- Frontend at `http://localhost:3000`
- Backend at `http://localhost:3001`

## Next Steps

- [Your First Project](/getting-started/first-project/) — Detailed walkthrough
- [CLI Commands](/cli/) — Explore all available commands
- [Tutorials](/tutorials/saas-app/) — Build a complete SaaS app
