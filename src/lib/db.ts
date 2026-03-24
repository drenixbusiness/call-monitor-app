import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

function getConnectionString(): string | undefined {
  return process.env.POSTGRES_URL || process.env.DATABASE_URL;
}

/** Lazy so `next build` can complete when env is only set at runtime on Vercel. */
let sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  const url = getConnectionString();
  if (!url) {
    throw new Error(
      'Database not configured: set POSTGRES_URL (or DATABASE_URL) in Vercel Environment Variables.'
    );
  }
  if (!sql) {
    sql = neon(url);
  }
  return sql;
}

async function initializeDatabase() {
  const url = getConnectionString();
  if (!url) {
    return;
  }
  try {
    const client = getSql();
    await client`
      CREATE TABLE IF NOT EXISTS calls (
        id TEXT PRIMARY KEY,
        call_id TEXT UNIQUE NOT NULL,
        from_number TEXT,
        to_number TEXT,
        direction TEXT,
        result TEXT,
        user_extension TEXT,
        start_time TEXT,
        duration INTEGER,
        recording_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_start_time ON calls (start_time)`;
    await client`CREATE INDEX IF NOT EXISTS idx_user_extension ON calls (user_extension)`;
    await client`ALTER TABLE calls ADD COLUMN IF NOT EXISTS account TEXT DEFAULT 'account1'`;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('already exists')) {
      console.error('Failed to initialize database:', error);
    }
  }
}

initializeDatabase().catch(console.error);

export const db = {
  prepare: (text: string) => ({
    run: async (values: unknown[] = []) => {
      try {
        return await getSql().query(text, values);
      } catch (error) {
        console.error('[db.run] SQL Error:', error);
        throw error;
      }
    },
    all: async (values: unknown[] = []) => {
      try {
        const result = await getSql().query(text, values);
        return Array.isArray(result) ? result : Array.from(result as Iterable<unknown>) || [];
      } catch (error) {
        console.error('[db.all] SQL Error:', error);
        throw error;
      }
    },
    get: async (values: unknown[] = []) => {
      try {
        const result = await getSql().query(text, values);
        const rows = Array.isArray(result) ? result : Array.from(result as Iterable<unknown>);
        return rows[0] || null;
      } catch (error) {
        console.error('[db.get] SQL Error:', error);
        throw error;
      }
    },
  }),
};

export default db;
