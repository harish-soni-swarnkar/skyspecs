import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

// Env lives in the repo root .env (one file for the whole workspace), so walk up to find it.
const here = dirname(fileURLToPath(import.meta.url));
for (const candidate of [
  resolve(here, "../.env"),
  resolve(here, "../../.env"),
  resolve(here, "../../../.env"),
]) {
  if (existsSync(candidate)) {
    loadEnv({ path: candidate });
    break;
  }
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://localhost:5432/skyspecs",
  port: Number.parseInt(process.env.PORT ?? "4000", 10),
  // Optional at boot: an unset token shouldn't stop the server. Only the TMDB-backed routes
  // (search, add-movie) fail — cleanly — when it's missing. See index.ts.
  tmdbAccessToken: process.env.TMDB_ACCESS_TOKEN ?? "",
} as const;
