import type { MovieDetails } from "@skyspecs/tmdb";
import type { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, tryProvisionTestDb } from "../test/testDb.js";
import { CollectionsRepository } from "./repository.js";
import { UsersRepository } from "./usersRepository.js";

// Exercises the real SQL against a real Postgres. Skips (not fails) when no DB is reachable, so
// `pnpm test` stays green without infra; run the DB first (`pnpm bootstrap`) to include these.
const ctx = await tryProvisionTestDb("repo");
const suite = ctx ? describe : describe.skip;
if (!ctx) {
  // eslint-disable-next-line no-console
  console.warn("[integration] no Postgres reachable — skipping repository integration tests");
}

const pool = ctx?.pool as Pool;

function details(over: Partial<MovieDetails> = {}): MovieDetails {
  return {
    tmdbId: 27205,
    title: "Inception",
    releaseYear: 2010,
    runtimeMinutes: 148,
    genres: ["Action", "Science Fiction"],
    posterPath: "/p.jpg",
    overview: "",
    voteAverage: 8.4,
    tagline: "",
    ...over,
  };
}

suite("repositories (integration)", () => {
  const users = new UsersRepository(pool);
  const repo = new CollectionsRepository(pool);

  beforeEach(() => resetDb(pool));
  afterAll(async () => {
    await pool.end();
  });

  it("creates and lists collections scoped to their owner", async () => {
    const alice = await users.create("Alice");
    const bob = await users.create("Bob");
    await repo.create(alice.id, "Rainy Sunday");

    expect((await repo.list(alice.id)).map((c) => c.name)).toEqual(["Rainy Sunday"]);
    expect(await repo.list(bob.id)).toEqual([]); // ownership isolation
  });

  it("lists users in creation order", async () => {
    await users.create("Alice");
    await users.create("Bob");
    expect((await users.list()).map((u) => u.name)).toEqual(["Alice", "Bob"]);
  });

  it("won't return another user's collection", async () => {
    const alice = await users.create("Alice");
    const bob = await users.create("Bob");
    const c = await repo.create(alice.id, "Private");

    expect(await repo.getWithMovies(bob.id, c.id)).toBeNull();
    expect(await repo.delete(bob.id, c.id)).toBe(false); // and can't delete it
    expect(await repo.getWithMovies(alice.id, c.id)).not.toBeNull();
  });

  it("won't let a non-owner mutate a collection's movies", async () => {
    const alice = await users.create("Alice");
    const bob = await users.create("Bob");
    const c = await repo.create(alice.id, "Alice's");
    await repo.addMovie(alice.id, c.id, details());

    // Every write path guards on ownership before touching a row.
    expect(await repo.addMovie(bob.id, c.id, details({ tmdbId: 603 }))).toBeNull();
    expect(await repo.updateAnnotations(bob.id, c.id, 27205, { rating: 1 })).toBeNull();
    expect(await repo.removeMovie(bob.id, c.id, 27205)).toBe(false);
    // Alice's data is untouched.
    expect((await repo.getWithMovies(alice.id, c.id))!.movies).toHaveLength(1);
  });

  it("snapshots TMDB details onto the join row and defaults annotations", async () => {
    const u = await users.create("U");
    const c = await repo.create(u.id, "C");
    await repo.addMovie(u.id, c.id, details());

    const loaded = await repo.getWithMovies(u.id, c.id);
    const movie = loaded!.movies[0]!;
    expect(movie).toMatchObject({
      tmdbId: 27205,
      title: "Inception",
      runtimeMinutes: 148,
      genres: ["Action", "Science Fiction"],
      note: "",
      tags: [],
      rating: null,
    });
  });

  it("updates annotations, and can clear a rating back to null", async () => {
    const u = await users.create("U");
    const c = await repo.create(u.id, "C");
    await repo.addMovie(u.id, c.id, details());

    await repo.updateAnnotations(u.id, c.id, 27205, { note: "great", tags: ["heist"], rating: 5 });
    let m = (await repo.getWithMovies(u.id, c.id))!.movies[0]!;
    expect(m).toMatchObject({ note: "great", tags: ["heist"], rating: 5 });

    // The nullable-rating flag: an explicit null clears it; omitting a field leaves it.
    await repo.updateAnnotations(u.id, c.id, 27205, { rating: null });
    m = (await repo.getWithMovies(u.id, c.id))!.movies[0]!;
    expect(m.rating).toBeNull();
    expect(m.note).toBe("great"); // untouched
  });

  it("keeps annotations independent for the same movie in two collections", async () => {
    const u = await users.create("U");
    const a = await repo.create(u.id, "A");
    const b = await repo.create(u.id, "B");
    await repo.addMovie(u.id, a.id, details());
    await repo.addMovie(u.id, b.id, details());

    await repo.updateAnnotations(u.id, a.id, 27205, { rating: 5, tags: ["a"] });
    await repo.updateAnnotations(u.id, b.id, 27205, { rating: 2, tags: ["b"] });

    const inA = (await repo.getWithMovies(u.id, a.id))!.movies[0]!;
    const inB = (await repo.getWithMovies(u.id, b.id))!.movies[0]!;
    expect(inA.rating).toBe(5);
    expect(inB.rating).toBe(2);
    expect(inA.tags).toEqual(["a"]);
    expect(inB.tags).toEqual(["b"]);
  });

  it("re-adding a movie refreshes the snapshot but preserves annotations (idempotent add)", async () => {
    const u = await users.create("U");
    const c = await repo.create(u.id, "C");
    await repo.addMovie(u.id, c.id, details({ title: "Old Title" }));
    await repo.updateAnnotations(u.id, c.id, 27205, { rating: 4, note: "keep me" });

    await repo.addMovie(u.id, c.id, details({ title: "New Title", runtimeMinutes: 150 }));

    const m = (await repo.getWithMovies(u.id, c.id))!.movies[0]!;
    expect(m.title).toBe("New Title"); // snapshot refreshed
    expect(m.runtimeMinutes).toBe(150);
    expect(m.rating).toBe(4); // annotations preserved
    expect(m.note).toBe("keep me");
  });

  it("removes a movie, and deleting a collection cascades", async () => {
    const u = await users.create("U");
    const c = await repo.create(u.id, "C");
    await repo.addMovie(u.id, c.id, details());
    await repo.addMovie(u.id, c.id, details({ tmdbId: 603, title: "The Matrix" }));

    expect(await repo.removeMovie(u.id, c.id, 603)).toBe(true);
    expect(await repo.removeMovie(u.id, c.id, 999)).toBe(false); // not present
    expect((await repo.getWithMovies(u.id, c.id))!.movies).toHaveLength(1);

    await repo.delete(u.id, c.id);
    const orphans = await pool.query("select count(*)::int as n from collection_movies");
    expect(orphans.rows[0].n).toBe(0); // cascade removed the join rows
  });
});
