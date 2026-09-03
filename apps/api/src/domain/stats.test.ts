import { describe, expect, it } from "vitest";
import { computeStats } from "./stats.js";
import type { CollectionMovie } from "./types.js";

function movie(overrides: Partial<CollectionMovie> = {}): CollectionMovie {
  return {
    tmdbId: 1,
    title: "A Movie",
    releaseYear: 2000,
    runtimeMinutes: 100,
    genres: ["Drama"],
    posterPath: null,
    snapshotAt: "2024-01-01T00:00:00.000Z",
    note: "",
    tags: [],
    rating: null,
    addedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeStats", () => {
  it("returns an empty shape for no movies", () => {
    expect(computeStats([])).toEqual({
      movieCount: 0,
      totalRuntimeMinutes: 0,
      averageRating: null,
      ratedCount: 0,
      genreBreakdown: [],
      releaseYearSpan: null,
    });
  });

  it("sums runtime and averages only the rated movies", () => {
    const stats = computeStats([
      movie({ runtimeMinutes: 100, rating: 4 }),
      movie({ runtimeMinutes: 120, rating: 2 }),
      movie({ runtimeMinutes: 90, rating: null }),
    ]);
    expect(stats.totalRuntimeMinutes).toBe(310);
    expect(stats.ratedCount).toBe(2);
    expect(stats.averageRating).toBe(3); // (4 + 2) / 2
  });

  it("rounds the average rating to one decimal", () => {
    const stats = computeStats([movie({ rating: 5 }), movie({ rating: 4 }), movie({ rating: 4 })]);
    expect(stats.averageRating).toBe(4.3); // 13/3 = 4.333...
  });

  it("skips missing runtime instead of counting it as zero", () => {
    const stats = computeStats([movie({ runtimeMinutes: 100 }), movie({ runtimeMinutes: null })]);
    expect(stats.totalRuntimeMinutes).toBe(100);
  });

  it("ranks genres by frequency, breaking ties alphabetically", () => {
    const stats = computeStats([
      movie({ genres: ["Drama", "Action"] }),
      movie({ genres: ["Drama"] }),
      movie({ genres: ["Comedy"] }),
    ]);
    expect(stats.genreBreakdown).toEqual([
      { genre: "Drama", count: 2 },
      { genre: "Action", count: 1 },
      { genre: "Comedy", count: 1 },
    ]);
  });

  it("spans the earliest and latest release years, ignoring unknowns", () => {
    const stats = computeStats([
      movie({ releaseYear: 1994 }),
      movie({ releaseYear: 2021 }),
      movie({ releaseYear: null }),
    ]);
    expect(stats.releaseYearSpan).toEqual({ earliest: 1994, latest: 2021 });
  });
});
