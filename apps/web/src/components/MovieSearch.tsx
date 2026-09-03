import { useEffect, useState } from "react";
import { posterUrl } from "../api/client.js";
import { useAddMovie, useSearch } from "../api/hooks.js";

/** Debounce so search isn't every keystroke. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function MovieSearch({
  collectionId,
  existingIds,
}: { collectionId: string; existingIds: Set<number> }) {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 300);
  const search = useSearch(debounced);
  const addMovie = useAddMovie(collectionId);
  const [pendingId, setPendingId] = useState<number | null>(null);

  return (
    <div className="movie-search">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search movies to add…"
        aria-label="Search movies"
      />

      {search.isFetching && <p className="muted">Searching…</p>}
      {search.isError && <p className="error">Search failed. Check the API and your TMDB token.</p>}
      {debounced && search.data && search.data.results.length === 0 && !search.isFetching && (
        <p className="muted">No matches for “{debounced}”.</p>
      )}

      <ul className="search-results">
        {search.data?.results.map((movie) => {
          const already = existingIds.has(movie.tmdbId);
          const poster = posterUrl(movie.posterPath, "w200");
          return (
            <li key={movie.tmdbId} className="search-result">
              {poster ? (
                <img src={poster} alt="" className="poster-thumb" loading="lazy" />
              ) : (
                <div className="poster-thumb poster-empty" aria-hidden />
              )}
              <div className="search-result-body">
                <span className="movie-title">
                  {movie.title} {movie.releaseYear && <span className="muted">({movie.releaseYear})</span>}
                </span>
                {movie.overview && <p className="overview">{movie.overview}</p>}
              </div>
              <button
                type="button"
                disabled={already || (addMovie.isPending && pendingId === movie.tmdbId)}
                onClick={() => {
                  setPendingId(movie.tmdbId);
                  addMovie.mutate(movie.tmdbId);
                }}
              >
                {already ? "Added" : addMovie.isPending && pendingId === movie.tmdbId ? "Adding…" : "Add"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
