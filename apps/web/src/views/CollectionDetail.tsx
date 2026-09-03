import { useCollection, useCollectionStats } from "../api/hooks.js";
import { CollectionMovieCard } from "../components/CollectionMovieCard.js";
import { MovieSearch } from "../components/MovieSearch.js";
import { StatsPanel } from "../components/StatsPanel.js";

export function CollectionDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const collection = useCollection(id);
  const stats = useCollectionStats(id);

  if (collection.isLoading) return <p className="muted">Loading…</p>;
  if (collection.isError || !collection.data) {
    return (
      <div>
        <button type="button" className="back" onClick={onBack}>
          ← Collections
        </button>
        <p className="error">Couldn't load this collection.</p>
      </div>
    );
  }

  const { data } = collection;
  const existingIds = new Set(data.movies.map((m) => m.tmdbId));

  return (
    <section>
      <button type="button" className="back" onClick={onBack}>
        ← Collections
      </button>
      <h1>{data.name}</h1>

      {stats.data && <StatsPanel stats={stats.data} />}

      <div className="detail-layout">
        <div className="detail-search">
          <h2>Add films</h2>
          <MovieSearch collectionId={id} existingIds={existingIds} />
        </div>

        <div className="detail-movies">
          <h2>
            In this collection <span className="muted">({data.movies.length})</span>
          </h2>
          {data.movies.length === 0 ? (
            <p className="muted">Nothing here yet. Search on the left to add films.</p>
          ) : (
            <ul className="movie-list">
              {data.movies.map((movie) => (
                <CollectionMovieCard key={movie.tmdbId} collectionId={id} movie={movie} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
