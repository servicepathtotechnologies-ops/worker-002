/**
 * Unit test: db-pool uses PGBOUNCER_URL when set, falls back to DATABASE_URL.
 *
 * The pg.Pool constructor is mocked so no real database connection is made.
 */

const mockPool = {
  on: jest.fn(),
  query: jest.fn(),
  connect: jest.fn(),
  totalCount: 0,
  idleCount: 0,
  waitingCount: 0,
};
const MockPool = jest.fn().mockImplementation(() => mockPool);

jest.mock('pg', () => ({ Pool: MockPool }));

describe('db-pool — PGBOUNCER_URL fallback', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses PGBOUNCER_URL when both vars are set', async () => {
    process.env.PGBOUNCER_URL = 'postgresql://pgbouncer:5432/db';
    process.env.DATABASE_URL  = 'postgresql://rds:5432/db';

    const { getDbPool } = await import('../db-pool');
    getDbPool();

    expect(MockPool).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: expect.stringContaining('pgbouncer'),
      })
    );
    expect(MockPool).not.toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: expect.stringContaining('rds'),
      })
    );
  });

  it('falls back to DATABASE_URL when PGBOUNCER_URL is absent', async () => {
    delete process.env.PGBOUNCER_URL;
    process.env.DATABASE_URL = 'postgresql://rds:5432/db';

    const { getDbPool } = await import('../db-pool');
    getDbPool();

    expect(MockPool).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: expect.stringContaining('rds'),
      })
    );
  });

  it('appends connect_timeout=4 when not already present', async () => {
    delete process.env.PGBOUNCER_URL;
    process.env.DATABASE_URL = 'postgresql://rds:5432/db';

    const { getDbPool } = await import('../db-pool');
    getDbPool();

    const callArg = MockPool.mock.calls[0][0];
    expect(callArg.connectionString).toContain('connect_timeout=4');
  });

  it('does not duplicate connect_timeout when already present', async () => {
    delete process.env.PGBOUNCER_URL;
    process.env.DATABASE_URL = 'postgresql://rds:5432/db?connect_timeout=4';

    const { getDbPool } = await import('../db-pool');
    getDbPool();

    const callArg = MockPool.mock.calls[0][0];
    const occurrences = (callArg.connectionString.match(/connect_timeout/g) || []).length;
    expect(occurrences).toBe(1);
  });

  it('returns a singleton (second call reuses same pool)', async () => {
    process.env.DATABASE_URL = 'postgresql://rds:5432/db';

    const { getDbPool } = await import('../db-pool');
    const p1 = getDbPool();
    const p2 = getDbPool();

    expect(p1).toBe(p2);
    expect(MockPool).toHaveBeenCalledTimes(1);
  });
});
