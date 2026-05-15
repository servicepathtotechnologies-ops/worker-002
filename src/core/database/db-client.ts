/**
 * AWS RDS database client — canonical entry point.
 *
 * Re-exports everything from aws-db-client.ts.
 * New code should import from this file:
 *
 *   import { getDbClient } from '../core/database/db-client';
 *
 * The underlying implementation uses pg.Pool → AWS RDS PostgreSQL.
 */

export { getDbClient, createDbClient } from './aws-db-client';
