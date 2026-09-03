import { Client, Pool } from "pg";
import { config } from "../config.js";
import { migrate } from "../db/migrate.js";

// Spin up a throwaway <db>_test on the same server for the integration suite, created and
// migrated on demand. Returns null when there's no Postgres to reach, so the tests skip rather
// than fail — unit runs shouldn't need infra.

// One database per test file (the label), so files running in parallel don't truncate each other.
function testDbUrl(label: string): string {
  const url = new URL(process.env.TEST_DATABASE_URL ?? config.databaseUrl);
  const base = (url.pathname.replace(/^\//, "") || "skyspecs").replace(/_test$/, "");
  url.pathname = `/${base}_test_${label}`;
  return url.toString();
}

export async function tryProvisionTestDb(label = "default"): Promise<{ pool: Pool; url: string } | null> {
  const url = testDbUrl(label);
  const target = new URL(url);
  const dbName = target.pathname.replace(/^\//, "");
  const adminUrl = new URL(target);
  adminUrl.pathname = "/postgres";

  try {
    const admin = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 2000 });
    await admin.connect();
    try {
      const exists = await admin.query("select 1 from pg_database where datname = $1", [dbName]);
      if (exists.rowCount === 0) {
        await admin.query(`create database "${dbName.replace(/"/g, '""')}"`);
      }
    } finally {
      await admin.end();
    }
    const pool = new Pool({ connectionString: url });
    await migrate(pool);
    return { pool, url };
  } catch {
    return null; // nothing to connect to; the suite skips
  }
}

// Wipe everything between tests — users too, so each one starts from empty.
export async function resetDb(pool: Pool): Promise<void> {
  await pool.query("truncate table collection_movies, collections, users restart identity cascade");
}
