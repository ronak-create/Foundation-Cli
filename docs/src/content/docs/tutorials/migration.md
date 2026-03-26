---
title: Tutorial - Migrating Projects
description: How to swap modules in an existing Foundation project - change ORM, backend, or database
---



Learn how to switch modules in an existing Foundation project without losing your code.

## Common Migrations

- Change ORM (Prisma → TypeORM)
- Change backend (Express → NestJS)
- Change database (PostgreSQL → MySQL)
- Add auth to existing project

## Before You Start

Backup your project:
```bash
git add .
git commit -m "backup before migration"
```

## Migration: Prisma to TypeORM

### Step 1: Check Current State

```bash
foundation info
# Shows current ORM: Prisma
```

### Step 2: Switch ORM

```bash
foundation switch orm typeorm
```

### Step 3: Migrate Data Models

Your Prisma schema is in `prisma/schema.prisma`. Convert to TypeORM entities:

```typescript
// src/entities/User.entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column()
  passwordHash: string;
}
```

### Step 4: Update Data Source

```typescript
// src/data-source.ts
import { DataSource } from 'typeorm';
import { User } from './entities/User.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  entities: [User],
  synchronize: true,
});
```

## Migration: Express to NestJS

### Step 1: Switch Backend

```bash
foundation switch backend nestjs
```

### Step 2: Refactor Routes to Controllers

Express:
```typescript
// src/routes/users.ts
router.get('/users', getUsers);
```

NestJS:
```typescript
// src/users/users.controller.ts
@Controller('users')
export class UsersController {
  @Get()
  findAll() { return this.usersService.findAll(); }
}
```

## Migration: Add Auth to Existing Project

If you created a project without auth:

```bash
foundation add auth-jwt
```

This adds:
- `src/auth/` directory with service, middleware, router
- Updates package.json with dependencies

## After Migration

1. **Run doctor** — Verify everything works:
   ```bash
   foundation doctor
   ```

2. **Test imports** — Ensure code compiles:
   ```bash
   npm run typecheck
   ```

3. **Check .env** — Add any new environment variables

## Rollback

If migration fails:

```bash
git checkout -- .
git clean -fd
```

## Related

- [CLI: switch](/cli/switch/)
- [CLI: add](/cli/add/)
- [CLI: doctor](/cli/doctor/)
