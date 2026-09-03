import { type MovieDetails, type MovieSearchPage, TmdbError } from "@skyspecs/tmdb";
import { describe, expect, it, vi } from "vitest";
import type { CollectionsRepository } from "./db/repository.js";
import type { UsersRepository } from "./db/usersRepository.js";
import { type TmdbGateway, buildServer } from "./server.js";

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

function emptyPage(): MovieSearchPage {
  return { page: 1, totalPages: 0, totalResults: 0, results: [] };
}

/** Build a server with fully stubbed dependencies; each test overrides what it exercises. */
function harness(
  overrides: {
    repo?: Partial<CollectionsRepository>;
    users?: Partial<UsersRepository>;
    tmdb?: Partial<TmdbGateway>;
    imageFetch?: typeof fetch;
  } = {},
) {
  const tmdb: TmdbGateway = {
    searchMovies: vi.fn().mockResolvedValue(emptyPage()),
    getMovie: vi.fn().mockResolvedValue(details()),
    ...overrides.tmdb,
  };
  const repo = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    delete: vi.fn(),
    getWithMovies: vi.fn(),
    addMovie: vi.fn(),
    removeMovie: vi.fn(),
    updateAnnotations: vi.fn(),
    ...overrides.repo,
  } as unknown as CollectionsRepository;
  const users = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    ...overrides.users,
  } as unknown as UsersRepository;
  return { app: buildServer({ repo, users, tmdb, imageFetch: overrides.imageFetch }), tmdb, repo, users };
}

describe("GET /search", () => {
  it("proxies the query to the TMDB gateway", async () => {
    const searchMovies = vi.fn().mockResolvedValue(emptyPage());
    const { app } = harness({ tmdb: { searchMovies } });
    const res = await app.inject({ method: "GET", url: "/search?query=inception&page=2" });
    expect(res.statusCode).toBe(200);
    expect(searchMovies).toHaveBeenCalledWith("inception", 2);
  });

  it("rejects a blank query with 422", async () => {
    const { app } = harness();
    const res = await app.inject({ method: "GET", url: "/search?query=" });
    expect(res.statusCode).toBe(422);
  });
});

describe("users", () => {
  it("lists users", async () => {
    const list = vi.fn().mockResolvedValue([{ id: "u1", name: "Default User" }]);
    const { app } = harness({ users: { list } });
    const res = await app.inject({ method: "GET", url: "/users" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ id: "u1", name: "Default User" }]);
  });

  it("creates a user (201)", async () => {
    const create = vi.fn().mockResolvedValue({ id: "u2", name: "Alex" });
    const { app } = harness({ users: { create } });
    const res = await app.inject({ method: "POST", url: "/users", payload: { name: "Alex" } });
    expect(res.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith("Alex");
  });

  it("rejects an empty user name (422)", async () => {
    const { app } = harness();
    const res = await app.inject({ method: "POST", url: "/users", payload: { name: "" } });
    expect(res.statusCode).toBe(422);
  });
});

describe("collection routes", () => {
  it("GET /health is ok", async () => {
    const { app } = harness();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.json()).toEqual({ ok: true });
  });

  it("GET /collections lists for the current user", async () => {
    const list = vi.fn().mockResolvedValue([{ id: "c1", name: "A", createdAt: "x", movieCount: 0 }]);
    const { app } = harness({ repo: { list } });
    const res = await app.inject({ method: "GET", url: "/collections" });
    expect(res.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith(expect.any(String));
  });

  it("honours the x-user-id header", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const { app } = harness({ repo: { list } });
    await app.inject({ method: "GET", url: "/collections", headers: { "x-user-id": "user-42" } });
    expect(list).toHaveBeenCalledWith("user-42");
  });

  it("GET /collections/:id returns it, or 404", async () => {
    const found = { id: "c1", name: "A", createdAt: "x", movieCount: 0, movies: [] };
    const { app } = harness({ repo: { getWithMovies: vi.fn().mockResolvedValue(found) } });
    expect((await app.inject({ method: "GET", url: "/collections/c1" })).statusCode).toBe(200);

    const missing = harness({ repo: { getWithMovies: vi.fn().mockResolvedValue(null) } });
    expect((await missing.app.inject({ method: "GET", url: "/collections/x" })).statusCode).toBe(404);
  });

  it("DELETE /collections/:id → 204, or 404", async () => {
    const ok = harness({ repo: { delete: vi.fn().mockResolvedValue(true) } });
    expect((await ok.app.inject({ method: "DELETE", url: "/collections/c1" })).statusCode).toBe(204);

    const gone = harness({ repo: { delete: vi.fn().mockResolvedValue(false) } });
    expect((await gone.app.inject({ method: "DELETE", url: "/collections/x" })).statusCode).toBe(404);
  });

  it("PATCH annotations → the updated movie, or 404", async () => {
    const updated = { tmdbId: 1, rating: 5 };
    const ok = harness({ repo: { updateAnnotations: vi.fn().mockResolvedValue(updated) } });
    const res = await ok.app.inject({
      method: "PATCH",
      url: "/collections/c1/movies/1",
      payload: { rating: 5 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ rating: 5 });

    const missing = harness({ repo: { updateAnnotations: vi.fn().mockResolvedValue(null) } });
    const res2 = await missing.app.inject({
      method: "PATCH",
      url: "/collections/c1/movies/1",
      payload: { rating: 5 },
    });
    expect(res2.statusCode).toBe(404);
  });

  it("PATCH with an empty patch is 422", async () => {
    const { app } = harness();
    const res = await app.inject({ method: "PATCH", url: "/collections/c1/movies/1", payload: {} });
    expect(res.statusCode).toBe(422);
  });
});

describe("GET /images/:size/:file (poster proxy)", () => {
  const imageResponse = () =>
    new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } });

  it("streams a valid poster and never leaks the request to an arbitrary host", async () => {
    const imageFetch = vi.fn<typeof fetch>().mockResolvedValue(imageResponse());
    const { app } = harness({ imageFetch });
    const res = await app.inject({ method: "GET", url: "/images/w200/abc123.jpg" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["cache-control"]).toContain("immutable");
    expect(imageFetch).toHaveBeenCalledWith("https://image.tmdb.org/t/p/w200/abc123.jpg");
  });

  it("rejects an unknown size without hitting the network (not an open proxy)", async () => {
    const imageFetch = vi.fn<typeof fetch>();
    const { app } = harness({ imageFetch });
    const res = await app.inject({ method: "GET", url: "/images/evil/abc.jpg" });
    expect(res.statusCode).toBe(400);
    expect(imageFetch).not.toHaveBeenCalled();
  });

  it("rejects a path-like filename (no traversal / no SSRF)", async () => {
    const imageFetch = vi.fn<typeof fetch>();
    const { app } = harness({ imageFetch });
    const res = await app.inject({ method: "GET", url: "/images/w200/..%2f..%2fetc%2fpasswd" });
    expect(res.statusCode).toBe(400);
    expect(imageFetch).not.toHaveBeenCalled();
  });

  it("maps an upstream miss to 404", async () => {
    const imageFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    const { app } = harness({ imageFetch });
    const res = await app.inject({ method: "GET", url: "/images/w500/missing.jpg" });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /collections", () => {
  it("creates a collection", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ id: "c1", name: "Rainy Sunday", createdAt: "x", movieCount: 0 });
    const { app } = harness({ repo: { create } });
    const res = await app.inject({ method: "POST", url: "/collections", payload: { name: "Rainy Sunday" } });
    expect(res.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith(expect.any(String), "Rainy Sunday");
  });

  it("rejects an empty name with 422", async () => {
    const { app } = harness();
    const res = await app.inject({ method: "POST", url: "/collections", payload: { name: "   " } });
    expect(res.statusCode).toBe(422);
  });
});

describe("POST /collections/:id/movies", () => {
  it("fetches details from TMDB and snapshots them via the repo", async () => {
    const getMovie = vi.fn().mockResolvedValue(details());
    const addMovie = vi.fn().mockResolvedValue({ tmdbId: 27205 });
    const { app } = harness({ tmdb: { getMovie }, repo: { addMovie } });

    const res = await app.inject({
      method: "POST",
      url: "/collections/c1/movies",
      payload: { tmdbId: 27205 },
    });

    expect(res.statusCode).toBe(201);
    expect(getMovie).toHaveBeenCalledWith(27205);
    expect(addMovie).toHaveBeenCalledWith(expect.any(String), "c1", details());
  });

  it("returns 404 when the collection isn't owned/found", async () => {
    const { app } = harness({ repo: { addMovie: vi.fn().mockResolvedValue(null) } });
    const res = await app.inject({
      method: "POST",
      url: "/collections/missing/movies",
      payload: { tmdbId: 1 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("maps a TMDB not_found to 404", async () => {
    const getMovie = vi.fn().mockRejectedValue(new TmdbError("not_found", "no such movie", { status: 404 }));
    const { app } = harness({ tmdb: { getMovie } });
    const res = await app.inject({
      method: "POST",
      url: "/collections/c1/movies",
      payload: { tmdbId: 999999 },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("tmdb_not_found");
  });
});

describe("GET /collections/:id/stats", () => {
  it("computes stats from the stored snapshots", async () => {
    const getWithMovies = vi.fn().mockResolvedValue({
      id: "c1",
      name: "x",
      createdAt: "x",
      movieCount: 2,
      movies: [
        { runtimeMinutes: 100, rating: 4, genres: ["Drama"], releaseYear: 1999 },
        { runtimeMinutes: 120, rating: 2, genres: ["Drama"], releaseYear: 2010 },
      ],
    });
    const { app } = harness({ repo: { getWithMovies } });
    const res = await app.inject({ method: "GET", url: "/collections/c1/stats" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      totalRuntimeMinutes: 220,
      averageRating: 3,
      releaseYearSpan: { earliest: 1999, latest: 2010 },
    });
  });

  it("returns 404 for an unknown collection", async () => {
    const { app } = harness({ repo: { getWithMovies: vi.fn().mockResolvedValue(null) } });
    const res = await app.inject({ method: "GET", url: "/collections/nope/stats" });
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /collections/:id/movies/:tmdbId", () => {
  it("removes a movie (204)", async () => {
    const { app } = harness({ repo: { removeMovie: vi.fn().mockResolvedValue(true) } });
    const res = await app.inject({ method: "DELETE", url: "/collections/c1/movies/603" });
    expect(res.statusCode).toBe(204);
  });

  it("returns 404 when the movie/collection isn't found", async () => {
    const { app } = harness({ repo: { removeMovie: vi.fn().mockResolvedValue(false) } });
    const res = await app.inject({ method: "DELETE", url: "/collections/c1/movies/603" });
    expect(res.statusCode).toBe(404);
  });

  // An empty body with a JSON content-type is a client mistake: Fastify raises a 4xx for it, and
  // the handler must surface that rather than blanket it as a 500.
  it("maps an empty-JSON-body request to a 4xx, never 500", async () => {
    const { app } = harness({ repo: { removeMovie: vi.fn().mockResolvedValue(true) } });
    const res = await app.inject({
      method: "DELETE",
      url: "/collections/c1/movies/603",
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });
});
