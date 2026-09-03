export { TmdbClient, createTmdbClient, type TmdbClientOptions } from "./client.js";
export { TmdbError, type TmdbErrorKind } from "./errors.js";
export type {
  MovieDetails,
  MovieSearchResult,
  MovieSearchPage,
} from "./schemas.js";

/** TMDB poster URL, or null. */
export function posterUrl(
  posterPath: string | null,
  size: "w200" | "w500" | "original" = "w500",
): string | null {
  if (!posterPath) return null;
  return `https://image.tmdb.org/t/p/${size}${posterPath}`;
}
