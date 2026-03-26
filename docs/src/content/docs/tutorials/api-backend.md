---
title: Tutorial - API Backend
description: Build a Python API with FastAPI and SQLAlchemy
---



Build a Python REST API with FastAPI and SQLAlchemy.

## Goal

Create an API-only project with:
- FastAPI backend
- SQLAlchemy ORM
- PostgreSQL database

## Step 1: Create the Project

```bash
foundation create api-backend --preset api-backend
```

This preset uses Express by default. Let's switch to FastAPI:

```bash
foundation switch backend fastapi
```

Wait, FastAPI is Python-based and needs SQLAlchemy:

```bash
foundation add orm-sqlalchemy
```

## Step 2: Start Development

```bash
npm run dev:python  # Starts uvicorn
# or
python -m uvicorn app.main:app --reload
```

API at `http://localhost:8000`

## Step 3: Generate Models

```bash
foundation generate model Item
# Add fields: name (string), description (string), price (number)
```

Generates:
- `src/models.py` — SQLAlchemy model
- `src/schemas.py` — Pydantic schemas

## Step 4: Add CRUD Endpoints

```bash
foundation generate crud Item
```

Generates FastAPI router with:
- GET /items
- POST /items
- GET /items/{id}
- PUT /items/{id}
- DELETE /items/{id}

## Step 5: Add Authentication

```bash
foundation add auth-jwt
```

## Project Structure

```
api-backend/
├── app/
│   ├── main.py             # FastAPI app
│   ├── models.py           # SQLAlchemy models
│   └── routers/            # CRUD endpoints
├── src/
│   └── database.py         # SQLAlchemy engine
├── requirements.txt
└── alembic/
```

## Related

- [CLI: switch](/cli/switch/)
- [CLI: generate](/cli/generate/)
- [Modules: Backend](/modules/backend/)
- [Modules: ORM](/modules/orm/)
