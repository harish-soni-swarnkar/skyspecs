import type { MovieDetails } from "@skyspecs/tmdb";
import { TmdbError } from "@skyspecs/tmdb";
import type { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CollectionsRepository } from "./db/repository.js";
import { UsersRepository } from "./db/usersRepository.js";
import { type TmdbGateway, buildServer } from "./server.js";
import { resetDb, tryProvisionTestDb } from "./test/testDb.js";

// End to end at the HTTP level: real Fastify -> real repository -> real Postgres -> real stats.
// Only TMDB is faked (a take-home shouldn't hammer their API in CI). Skips without a DB.
const ctx = await tryProvisionTestDb("e2e");
const suite = ctx ? describe : describe.skip;
const pool = ctx?.pool as Pool;

const CATALOG: Record<number, MovieDetails> = {
  1: {
    tmdbId: 1,
    title: "Alpha",
    releaseYear: 2000,
    runtimeMinutes: 100,
    genres: ["Drama"],
    posterPath: "/a.jpg",
    overview: "",
    voteAverage: 7,
    tagline: "",
  },
  2: {
    tmdbId: 2,
    title: "Beta",
    releaseYear: 2010,
    runtimeMinutes: 120,
    genres: ["Action"],
    posterPath: "/b.jpg",
    overview: "",
    voteAverage: 8,
    tagline: "",
  },
};

const tmdb: TmdbGateway = {
  searchMovies: async () => ({ page: 1, totalPages: 0, totalResults: 0, results: [] }),
  getMovie: async (id) => {
    const movie = CATALOG[id];
    if (!movie) throw new TmdbError("not_found", "no such movie", { status: 404 });
    return movie;
  },
};

suite("full flow over HTTP (real DB)", () => {
  const app = buildServer({
    repo: new CollectionsRepository(pool),
    users: new UsersRepository(pool),
    tmdb,
  });

  beforeEach(() => resetDb(pool));
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("create user → collection → add films → annotate → stats → remove → delete", async () => {
    // A real user, then act as them via the header.
    const user = (await app.inject({ method: "POST", url: "/users", payload: { name: "E2E" } })).json();
    const as = { "x-user-id": user.id };

    const collection = (
      await app.inject({ method: "POST", url: "/collections", headers: as, payload: { name: "Flow" } })
    ).json();

    // Add both films — the server fetches details (faked) and snapshots them.
    for (const tmdbId of [1, 2]) {
      const res = await app.inject({
        method: "POST",
        url: `/collections/${collection.id}/movies`,
        headers: as,
        payload: { tmdbId },
      });
      expect(res.statusCode).toBe(201);
    }

    // Annotate the first film.
    await app.inject({
      method: "PATCH",
      url: `/collections/${collection.id}/movies/1`,
      headers: as,
      payload: { rating: 5, note: "top", tags: ["x"] },
    });

    // Read it back — snapshots + annotations came through the real DB.
    const full = (
      await app.inject({ method: "GET", url: `/collections/${collection.id}`, headers: as })
    ).json();
    expect(full.movies).toHaveLength(2);
    const alpha = full.movies.find((m: { tmdbId: number }) => m.tmdbId === 1);
    expect(alpha).toMatchObject({ title: "Alpha", runtimeMinutes: 100, rating: 5, tags: ["x"] });

    // Stats computed from the stored snapshots.
    const stats = (
      await app.inject({ method: "GET", url: `/collections/${collection.id}/stats`, headers: as })
    ).json();
    expect(stats).toMatchObject({
      movieCount: 2,
      totalRuntimeMinutes: 220, // 100 + 120
      averageRating: 5, // only Alpha is rated
      ratedCount: 1,
      releaseYearSpan: { earliest: 2000, latest: 2010 },
    });

    // Remove one, then delete the collection.
    expect(
      (await app.inject({ method: "DELETE", url: `/collections/${collection.id}/movies/2`, headers: as }))
        .statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: "DELETE", url: `/collections/${collection.id}`, headers: as })).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: "GET", url: `/collections/${collection.id}`, headers: as })).statusCode,
    ).toBe(404);
  });

  it("keeps collections private per user", async () => {
    const alice = (await app.inject({ method: "POST", url: "/users", payload: { name: "Alice" } })).json();
    const bob = (await app.inject({ method: "POST", url: "/users", payload: { name: "Bob" } })).json();
    await app.inject({
      method: "POST",
      url: "/collections",
      headers: { "x-user-id": alice.id },
      payload: { name: "Alice only" },
    });

    const bobList = (
      await app.inject({ method: "GET", url: "/collections", headers: { "x-user-id": bob.id } })
    ).json();
    expect(bobList).toEqual([]);
  });
});
