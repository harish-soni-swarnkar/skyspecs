import { TmdbError, createTmdbClient } from "@skyspecs/tmdb";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { CollectionsRepository } from "./db/repository.js";
import { UsersRepository } from "./db/usersRepository.js";
import { type TmdbGateway, buildServer } from "./server.js";

/** When no token is configured, TMDB-backed routes fail cleanly instead of crashing the server. */
function unconfiguredTmdb(): TmdbGateway {
  const fail = (): never => {
    throw new TmdbError("auth", "TMDB_ACCESS_TOKEN is not set — search and add-movie are disabled");
  };
  return { searchMovies: fail, getMovie: fail };
}

async function main(): Promise<void> {
  const repo = new CollectionsRepository(pool);
  const users = new UsersRepository(pool);
  const tmdb = config.tmdbAccessToken
    ? createTmdbClient({ accessToken: config.tmdbAccessToken })
    : unconfiguredTmdb();
  if (!config.tmdbAccessToken) {
    console.warn("TMDB_ACCESS_TOKEN not set — /search and add-movie will return an error.");
  }

  const app = buildServer({ repo, users, tmdb });
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`API listening on http://localhost:${config.port}`);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void app.close().then(() => pool.end().then(() => process.exit(0)));
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
