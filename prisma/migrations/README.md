# Prisma Migrations

This directory contains database migrations for the memory system.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up your database connection in `.env`:
```
DATABASE_URL=postgresql://user:password@host:port/database
```

3. Generate Prisma client:
```bash
npx prisma generate
```

4. Run migrations:
```bash
npx prisma migrate dev --name init
```

## PostgreSQL Extensions Required

The memory system requires the `pgvector` extension for vector similarity search:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Run this in your PostgreSQL database before running migrations.

## Manual Migration

If you prefer to run migrations manually, you can use the SQL files in this directory or generate them with:

```bash
npx prisma migrate dev --create-only
```

Then apply them manually to your database.
