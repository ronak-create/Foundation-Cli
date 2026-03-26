---
title: Deployment
description: Deployment targets - Docker, Vercel, Render, AWS ECS
---



Foundation CLI generates deployment configurations for 4 platforms.

## Available Modules

| ID | Name | Key Files |
|----|------|-----------|
| `deployment-docker` | Docker | Dockerfile, docker-compose.yml, .dockerignore |
| `deployment-vercel` | Vercel | vercel.json, .vercelignore |
| `deployment-render` | Render | render.yaml |
| `deployment-aws` | AWS ECS | ecs-task-definition.json, deploy.yml |

## Docker (`deployment-docker`)

Multi-stage Dockerfile + docker-compose:
- `Dockerfile` — Dependencies → builder → runner stages
- `docker-compose.yml` — App + PostgreSQL with health checks
- `.dockerignore` — Standard exclusions

```bash
docker-compose up --build
```

## Vercel (`deployment-vercel`)

Zero-config deployment:
- `vercel.json` — Functions config + CORS headers
- `.vercelignore` — Deployment exclusions

```bash
vercel deploy
```

## Render (`deployment-render`)

Blueprint-based deployment:
- `render.yaml` — Render Blueprint (web service + managed PostgreSQL)

```bash
render blueprint apply render.yaml
```

## AWS ECS (`deployment-aws`)

Full CI/CD pipeline:
- `infra/ecs-task-definition.json` — ECS task definition
- `.github/workflows/deploy.yml` — GitHub Actions (build → push ECR → update ECS)

## Related

- [Modules Overview](/modules/overview/) — All categories
- [Archetypes](/advanced/archetypes/) — Deployment in presets
- [Database Modules](/modules/database/) — Database in containers
