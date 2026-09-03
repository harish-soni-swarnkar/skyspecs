import { z } from "zod";

// Only the fields we read. TMDB sends a lot more; we ignore the rest.

const tmdbSearchItemSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  release_date: z.string().optional(), // "" or "YYYY-MM-DD"; absent for some records
  poster_path: z.string().nullable().optional(),
  overview: z.string().optional(),
  vote_average: z.number().optional(),
});

export const tmdbSearchResponseSchema = z.object({
  page: z.number().int(),
  total_pages: z.number().int(),
  total_results: z.number().int(),
  results: z.array(tmdbSearchItemSchema),
});

export const tmdbMovieDetailsSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  release_date: z.string().optional(),
  runtime: z.number().nullable().optional(), // minutes; null while TMDB lacks the data
  genres: z.array(z.object({ id: z.number().int(), name: z.string() })).optional(),
  poster_path: z.string().nullable().optional(),
  overview: z.string().optional(),
  tagline: z.string().optional(),
  vote_average: z.number().optional(),
});

/** What callers get after we map off TMDB's snake_case. */
export interface MovieSearchResult {
  tmdbId: number;
  title: string;
  releaseYear: number | null;
  posterPath: string | null;
  overview: string;
  voteAverage: number;
}

export interface MovieDetails extends MovieSearchResult {
  runtimeMinutes: number | null;
  genres: string[];
  tagline: string;
}

export interface MovieSearchPage {
  page: number;
  totalPages: number;
  totalResults: number;
  results: MovieSearchResult[];
}

function releaseYear(releaseDate: string | undefined): number | null {
  if (!releaseDate) return null;
  const year = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

export function toMovieSearchResult(raw: z.infer<typeof tmdbSearchItemSchema>): MovieSearchResult {
  return {
    tmdbId: raw.id,
    title: raw.title,
    releaseYear: releaseYear(raw.release_date),
    posterPath: raw.poster_path ?? null,
    overview: raw.overview ?? "",
    voteAverage: raw.vote_average ?? 0,
  };
}

export function toMovieDetails(raw: z.infer<typeof tmdbMovieDetailsSchema>): MovieDetails {
  return {
    tmdbId: raw.id,
    title: raw.title,
    releaseYear: releaseYear(raw.release_date),
    posterPath: raw.poster_path ?? null,
    overview: raw.overview ?? "",
    voteAverage: raw.vote_average ?? 0,
    runtimeMinutes: raw.runtime ?? null,
    genres: (raw.genres ?? []).map((g) => g.name),
    tagline: raw.tagline ?? "",
  };
}
