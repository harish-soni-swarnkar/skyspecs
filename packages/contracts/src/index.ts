// Types that cross the wire. api and web both import this, so they can't drift.

export interface User {
  id: string;
  name: string;
}

export interface Collection {
  id: string;
  name: string;
  createdAt: string;
  movieCount: number;
}

// A film in a collection: the TMDB snapshot (can be stale) + this collection's notes/tags/rating.
export interface CollectionMovie {
  tmdbId: number;
  title: string;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  genres: string[];
  posterPath: string | null;
  snapshotAt: string;
  note: string;
  tags: string[];
  rating: number | null;
  addedAt: string;
}

export interface CollectionWithMovies extends Collection {
  movies: CollectionMovie[];
}

export interface CollectionStats {
  movieCount: number;
  totalRuntimeMinutes: number;
  // rated films only; null if nothing's rated
  averageRating: number | null;
  ratedCount: number;
  // most common first
  genreBreakdown: Array<{ genre: string; count: number }>;
  releaseYearSpan: { earliest: number; latest: number } | null;
}

export interface AnnotationPatch {
  note?: string;
  tags?: string[];
  rating?: number | null;
}

// what /search returns (same shape the tmdb lib maps to)
export interface MovieSearchResult {
  tmdbId: number;
  title: string;
  releaseYear: number | null;
  posterPath: string | null;
  overview: string;
  voteAverage: number;
}

export interface MovieSearchPage {
  page: number;
  totalPages: number;
  totalResults: number;
  results: MovieSearchResult[];
}
