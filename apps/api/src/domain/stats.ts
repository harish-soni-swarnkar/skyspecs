import type { CollectionMovie, CollectionStats } from "./types.js";

/** Stats from local snapshots. Missing runtime is skipped, not treated as 0. */
export function computeStats(movies: CollectionMovie[]): CollectionStats {
  let totalRuntimeMinutes = 0;
  let ratingSum = 0;
  let ratedCount = 0;
  const genreCounts = new Map<string, number>();
  let earliest: number | null = null;
  let latest: number | null = null;

  for (const movie of movies) {
    if (movie.runtimeMinutes != null) totalRuntimeMinutes += movie.runtimeMinutes;

    if (movie.rating != null) {
      ratingSum += movie.rating;
      ratedCount += 1;
    }

    for (const genre of movie.genres) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }

    if (movie.releaseYear != null) {
      earliest = earliest == null ? movie.releaseYear : Math.min(earliest, movie.releaseYear);
      latest = latest == null ? movie.releaseYear : Math.max(latest, movie.releaseYear);
    }
  }

  const genreBreakdown = [...genreCounts.entries()]
    .map(([genre, count]) => ({ genre, count }))
    // Most common first; ties broken alphabetically so the order is stable.
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));

  return {
    movieCount: movies.length,
    totalRuntimeMinutes,
    averageRating: ratedCount === 0 ? null : Math.round((ratingSum / ratedCount) * 10) / 10,
    ratedCount,
    genreBreakdown,
    releaseYearSpan: earliest == null || latest == null ? null : { earliest, latest },
  };
}
