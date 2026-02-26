# Database Node Executors

This directory contains database node executors for the workflow automation system. Each executor handles connection management, credential validation, and operation execution for its respective database.

## Implemented Databases

1. **SQL Server** (`sqlServerNode.ts`) - Microsoft SQL Server
2. **MongoDB** (`mongoDBNode.ts`) - MongoDB
3. **MySQL** (`mysqlNode.ts`) - MySQL
4. **PostgreSQL** (`postgresNode.ts`) - PostgreSQL
5. **Redis** (`redisNode.ts`) - Redis
6. **Snowflake** (`snowflakeNode.ts`) - Snowflake
7. **SQLite** (`sqliteNode.ts`) - SQLite
8. **Supabase** (`supabaseNode.ts`) - Supabase
9. **TimescaleDB** (`timescaleDBNode.ts`) - TimescaleDB

## Required Dependencies

Install the following npm packages:

```bash
npm install mssql mongodb mysql2 ioredis snowflake-sdk better-sqlite3
```

Note: `pg` and `@supabase/supabase-js` are already installed in the project.

## Usage

Each executor exports a `run` function that accepts a `NodeExecutionContext` and returns a Promise with the result:

```typescript
import { runSQLServerNode } from './sqlServerNode';

const result = await runSQLServerNode({
  inputs: {
    host: 'localhost',
    port: 1433,
    username: 'user',
    password: 'pass',
    database: 'mydb',
    operation: 'executeQuery',
    query: 'SELECT * FROM users',
  },
  previousOutputs: {},
  workflowId: 'workflow-123',
  nodeId: 'node-1',
});
```

## Response Format

All executors return a consistent format:

```typescript
{
  success: true,
  data: {
    // Operation-specific result
  }
}
```

Or on error:

```typescript
{
  success: false,
  error: 'Error message'
}
```

## Integration

To integrate these nodes into the workflow execution system:

1. Add case statements in `worker/src/api/execute-workflow.ts` for each database node type
2. Import and use `executeDatabaseNode` from `database-node-handler.ts`
3. Create node definition files in `worker/src/nodes/definitions/` for UI schema
4. Register node definitions in `worker/src/nodes/definitions/index.ts`

## Credential Fields

Each database requires specific credential fields. See the individual executor files for details:

- **SQL Server**: host, port (1433), username, password, database, encrypt, trustServerCertificate
- **MongoDB**: connectionString OR (host, port, username, password, database, authSource, ssl)
- **MySQL**: host, port (3306), username, password, database, ssl
- **PostgreSQL**: host, port (5432), username, password, database, ssl
- **Redis**: host, port (6379), password (optional), db (0), tls
- **Snowflake**: account, username, password, database, schema, warehouse, role (optional)
- **SQLite**: filename, readonly
- **Supabase**: url, anonKey OR serviceRoleKey, schema (optional)
- **TimescaleDB**: Same as PostgreSQL

## Operations

Each database supports different operations. See the individual executor files for the complete list of supported operations.

## Security Notes

- All SQL queries use parameterized queries to prevent SQL injection
- Credentials are never logged
- Connections are properly closed after operations
- SSL/TLS is supported where applicable
