---
title: Backend Modules
description: Backend frameworks - Express, NestJS, FastAPI, Django
---



Foundation CLI supports 4 backend frameworks: 2 Node.js (Express, NestJS) and 2 Python (FastAPI, Django).

## Available Modules

| ID | Name | Runtime | Provides | Key Files |
|----|------|---------|----------|-----------|
| `backend-express` | Express | Node.js | `backend` | src/server.ts, .env.example |
| `backend-nestjs` | NestJS | Node.js | `backend` | src/main.ts, src/app.module.ts |
| `backend-fastapi` | FastAPI | Python | `backend` | app/main.py, requirements.txt |
| `backend-django` | Django | Python | `backend` | manage.py, settings.py, urls.py |

## Express (`backend-express`)

Fast, unopinionated Node.js web framework:
- `src/server.ts` — Express app with CORS, Helmet, JSON parsing, `/health` endpoint
- TypeScript configured

Dependencies: `express`, `cors`, `helmet`, `@types/express`

## NestJS (`backend-nestjs`)

Progressive Node.js framework:
- `src/main.ts` — Bootstrap with CORS
- `src/app.module.ts` — Root module
- `src/app.controller.ts` — Root controller
- `src/app.service.ts` — Root service

Dependencies: `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `reflect-metadata`, `rxjs`

## FastAPI (`backend-fastapi`)

Modern Python web framework:
- `app/main.py` — FastAPI app with CORS and `/health` route
- `requirements.txt` — Python dependencies

Dependencies: `fastapi`, `uvicorn`, `pydantic`

## Django (`backend-django`)

Full-stack Python framework:
- `manage.py` — Django management script
- `settings.py` — Settings with DRF, CORS, database config
- `urls.py` — URL configuration
- `views.py` — DRF views

Dependencies: `django`, `djangorestframework`, `django-cors-headers`

## Python Support

For Python backends, Foundation CLI:
1. Creates a virtual environment
2. Installs dependencies via pip
3. Generates appropriate scripts in package.json

## Related

- [Modules Overview](/modules/overview/) — All categories
- [Frontend Modules](/modules/frontend/) — Pair with a frontend
- [Database Modules](/modules/database/) — Add a database
