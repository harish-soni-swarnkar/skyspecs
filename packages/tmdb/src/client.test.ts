import { describe, expect, it, vi } from "vitest";
import { TmdbClient, createTmdbClient } from "./client.js";
import type { TmdbError } from "./errors.js";

const TOKEN = "test-token";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientWith(fetchImpl: typeof fetch): TmdbClient {
  return new TmdbClient({ accessToken: TOKEN, fetch: fetchImpl });
}

describe("searchMovies", () => {
  it("maps TMDB search items to the domain model", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        page: 1,
        total_pages: 3,
        total_results: 42,
        results: [
          {
            id: 27205,
            title: "Inception",
            release_date: "2010-07-15",
            poster_path: "/poster.jpg",
            overview: "A thief...",
            vote_average: 8.4,
          },
        ],
      }),
    );

    const page = await clientWith(fetchMock).searchMovies("inception");

    expect(page.totalPages).toBe(3);
    expect(page.results[0]).toEqual({
      tmdbId: 27205,
      title: "Inception",
      releaseYear: 2010,
      posterPath: "/poster.jpg",
      overview: "A thief...",
      voteAverage: 8.4,
    });
  });

  it("sends the Bearer token and query params", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ page: 1, total_pages: 0, total_results: 0, results: [] }));

    await clientWith(fetchMock).searchMovies("the matrix", 2);

    const [url, init] = fetchMock.mock.calls[0]!;
    const requested = new URL(url as URL);
    expect(requested.pathname).toBe("/3/search/movie");
    expect(requested.searchParams.get("query")).toBe("the matrix");
    expect(requested.searchParams.get("page")).toBe("2");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("short-circuits a blank query without hitting the network", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const page = await clientWith(fetchMock).searchMovies("   ");
    expect(page.results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a missing release_date as an unknown year, not a crash", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [{ id: 1, title: "Untitled", vote_average: 0 }],
      }),
    );
    const page = await clientWith(fetchMock).searchMovies("x");
    expect(page.results[0]!.releaseYear).toBeNull();
  });
});

describe("getMovie", () => {
  it("maps details including runtime and genre names", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 27205,
        title: "Inception",
        release_date: "2010-07-15",
        runtime: 148,
        genres: [
          { id: 28, name: "Action" },
          { id: 878, name: "Science Fiction" },
        ],
        poster_path: "/poster.jpg",
        tagline: "Your mind is the scene of the crime.",
        vote_average: 8.4,
      }),
    );

    const movie = await clientWith(fetchMock).getMovie(27205);

    expect(movie.runtimeMinutes).toBe(148);
    expect(movie.genres).toEqual(["Action", "Science Fiction"]);
    expect(movie.tagline).toContain("scene of the crime");
  });
});

describe("error mapping", () => {
  const cases: Array<[number, TmdbError["kind"]]> = [
    [401, "auth"],
    [403, "auth"],
    [404, "not_found"],
    [429, "rate_limited"],
    [500, "upstream"],
  ];

  for (const [status, kind] of cases) {
    it(`maps HTTP ${status} to a "${kind}" TmdbError`, async () => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("nope", { status }));
      await expect(clientWith(fetchMock).getMovie(1)).rejects.toMatchObject({
        name: "TmdbError",
        kind,
        status,
      });
    });
  }

  it("wraps a thrown fetch as a network error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    await expect(clientWith(fetchMock).getMovie(1)).rejects.toMatchObject({ kind: "network" });
  });

  it("flags a 200 whose body doesn't match the schema", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: "not-a-number", title: 5 }));
    await expect(clientWith(fetchMock).getMovie(1)).rejects.toMatchObject({
      kind: "invalid_response",
    });
  });

  it("flags a 200 with a non-JSON body", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("<html>not json</html>", { status: 200 }));
    await expect(clientWith(fetchMock).getMovie(1)).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("reports an aborted (timed-out) request as a network error", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(abort);
    await expect(clientWith(fetchMock).getMovie(1)).rejects.toMatchObject({ kind: "network" });
  });
});

describe("retries transient failures", () => {
  it("retries a network blip, then succeeds (with a real backoff)", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("flaky"))
      .mockResolvedValueOnce(jsonResponse({ id: 5, title: "OK" }));
    const client = new TmdbClient({ accessToken: TOKEN, fetch: fetchMock, retryDelayMs: 1 });
    await expect(client.getMovie(5)).resolves.toMatchObject({ tmdbId: 5 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 429, then succeeds", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ id: 5, title: "OK" }));
    const client = new TmdbClient({ accessToken: TOKEN, fetch: fetchMock, retryDelayMs: 0 });
    await expect(client.getMovie(5)).resolves.toMatchObject({ tmdbId: 5 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 5xx, then succeeds", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("boom", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ id: 5, title: "OK" }));
    const client = new TmdbClient({ accessToken: TOKEN, fetch: fetchMock, retryDelayMs: 0 });
    await expect(client.getMovie(5)).resolves.toMatchObject({ tmdbId: 5 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxRetries and throws the transient error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    const client = new TmdbClient({ accessToken: TOKEN, fetch: fetchMock, retryDelayMs: 0, maxRetries: 2 });
    await expect(client.getMovie(5)).rejects.toMatchObject({ kind: "network" });
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("does not retry a permanent error (404)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("nope", { status: 404 }));
    const client = new TmdbClient({ accessToken: TOKEN, fetch: fetchMock, retryDelayMs: 0, maxRetries: 2 });
    await expect(client.getMovie(5)).rejects.toMatchObject({ kind: "not_found" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("construction", () => {
  it("throws without an access token", () => {
    expect(() => new TmdbClient({ accessToken: "" })).toThrow(/accessToken/);
  });

  it("createTmdbClient builds a usable client", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ page: 1, total_pages: 0, total_results: 0, results: [] }));
    const client = createTmdbClient({ accessToken: TOKEN, fetch: fetchMock });
    await expect(client.searchMovies("x")).resolves.toMatchObject({ results: [] });
  });
});

describe("mapping falls back cleanly on missing optional fields", () => {
  it("treats an unparseable release_date as an unknown year", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [{ id: 9, title: "Weird", release_date: "not-a-date", vote_average: 0 }],
      }),
    );
    const page = await clientWith(fetchMock).searchMovies("x");
    expect(page.results[0]!.releaseYear).toBeNull();
  });

  it("search: absent poster/overview/vote become null/empty/0", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [{ id: 5, title: "Bare" }],
      }),
    );
    const page = await clientWith(fetchMock).searchMovies("x");
    expect(page.results[0]).toEqual({
      tmdbId: 5,
      title: "Bare",
      releaseYear: null,
      posterPath: null,
      overview: "",
      voteAverage: 0,
    });
  });

  it("details: absent runtime/genres/tagline become null/[]/empty", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 5, title: "Bare" }));
    const movie = await clientWith(fetchMock).getMovie(5);
    expect(movie).toMatchObject({ runtimeMinutes: null, genres: [], tagline: "", posterPath: null });
  });
});
