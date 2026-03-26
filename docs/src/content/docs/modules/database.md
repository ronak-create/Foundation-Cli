---
title: Database Modules
description: Databases - PostgreSQL, MySQL, MongoDB, SQLite, Supabase
---



Foundation CLI supports 5 databases with typed clients and migration scripts.

## Available Modules

| ID | Name | Client | Provides | Migrations |
|----|------|--------|----------|------------|
| `database-postgresql` | PostgreSQL | node-postgres | `database` | 001_init.sql |
| `database-mysql` | MySQL | mysql2 | `database` | 001_init.sql |
| `database-mongodb` | MongoDB | native driver | `database` | 001_init.js |
| `database-sqlite` | SQLite | better-sqlite3 | `database` | 001_init.sql |
| `database-supabase` | Supabase | @supabase/supabase-js | `database` | RLS init |

## PostgreSQL (`database-postgresql`)

- `src/db/client.ts` — node-postgres pool with typed query helper
- `migrations/001_init.sql` — Initial schema migration
- Connection pooling configured

## MySQL (`database-mysql`)

- `src/db/client.ts` — mysql2 promise pool
- `migrations/001_init.sql` — Initial schema migration

## MongoDB (`database-mongodb`)

- `src/db/client.ts` — Native MongoDB driver with connection singleton
- `migrations/001_init.js` — Index creation script

## SQLite (`database-sqlite`)

- `src/db/client.ts` — better-sqlite3 client with WAL mode
- `migrations/001_init.sql` — Initial schema migration

## Supabase (`database-supabase`)

- `src/db/client.ts` — Supabase JS client with anon + service-role configs
- `migrations/001_init.sql` — RLS (Row Level Security) init

## Database + ORM Compatibility

| Database | Prisma | TypeORM | Mongoose | SQLAlchemy |
|----------|--------|---------|---------|------------|
| PostgreSQL | ✅ | ✅ | ❌ | ⚠️ |
| MySQL | ✅ | ✅ | ❌ | ⚠️ |
| MongoDB | ⚠️ | ⚠️ | ✅ | ❌ |
| SQLite | ✅ | ✅ | ❌ | ✅ |
| Supabase | ✅ | ✅ | ❌ | ⚠️ |

## Related

- [Modules Overview](/modules/overview/) — All categories
- [ORM Modules](/modules/orm/) — Choose an ORM
- [Backend Modules](/modules/backend/) — Pair with a backend
