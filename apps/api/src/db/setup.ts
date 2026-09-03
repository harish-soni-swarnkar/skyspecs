import { Client, Pool } from "pg";
import { config } from "../config.js";
import { migrate } from "./migrate.js";

/** Create the database if needed, then migrate. Connects to `postgres` first to CREATE DATABASE. */
async function main(): Promise<void> {
  const url = new URL(config.databaseUrl);
  const dbName = url.pathname.replace(/^\//, "");
  if (!dbName) throw new Error(`DATABASE_URL has no database name: ${config.databaseUrl}`);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const exists = await admin.query("select 1 from pg_database where datname = $1", [dbName]);
    if (exists.rowCount === 0) {
      // Identifier can't be a bind param; dbName comes from our own env, not user input.
      await admin.query(`create database "${dbName.replace(/"/g, '""')}"`);
      console.log(`Created database "${dbName}".`);
    } else {
      console.log(`Database "${dbName}" already exists.`);
    }
  } finally {
    await admin.end();
  }

  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    const ran = await migrate(pool);
    console.log(ran.length ? `Applied migrations: ${ran.join(", ")}` : "No new migrations.");
  } finally {
    await pool.end();
  }
  console.log("Database ready.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
