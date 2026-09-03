import { useState } from "react";
import { posterUrl } from "../api/client.js";
import { useRemoveMovie, useUpdateAnnotations } from "../api/hooks.js";
import type { CollectionMovie } from "../api/types.js";
import { formatRuntime } from "../format.js";

function tagsToText(tags: string[]): string {
  return tags.join(", ");
}
function textToTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
}

export function CollectionMovieCard({
  collectionId,
  movie,
}: { collectionId: string; movie: CollectionMovie }) {
  const update = useUpdateAnnotations(collectionId);
  const remove = useRemoveMovie(collectionId);

  const [note, setNote] = useState(movie.note);
  const [tagsText, setTagsText] = useState(tagsToText(movie.tags));

  const noteDirty = note !== movie.note;
  const tagsDirty = tagsToText(textToTags(tagsText)) !== tagsToText(movie.tags);
  const dirty = noteDirty || tagsDirty;

  const poster = posterUrl(movie.posterPath, "w200");

  const saveText = () => {
    if (!dirty) return;
    update.mutate({ tmdbId: movie.tmdbId, patch: { note, tags: textToTags(tagsText) } });
  };

  const setRating = (value: number) => {
    // Clicking the current rating clears it back to unrated.
    const next = movie.rating === value ? null : value;
    update.mutate({ tmdbId: movie.tmdbId, patch: { rating: next } });
  };

  return (
    <li className="movie-card">
      {poster ? (
        <img src={poster} alt="" className="poster" loading="lazy" />
      ) : (
        <div className="poster poster-empty" aria-hidden />
      )}

      <div className="movie-card-body">
        <div className="movie-card-head">
          <span className="movie-title">
            {movie.title} {movie.releaseYear && <span className="muted">({movie.releaseYear})</span>}
          </span>
          <button
            type="button"
            className="danger-link"
            onClick={() => remove.mutate(movie.tmdbId)}
            aria-label={`Remove ${movie.title}`}
          >
            Remove
          </button>
        </div>

        <div className="movie-meta muted">
          {movie.runtimeMinutes ? formatRuntime(movie.runtimeMinutes) : "runtime unknown"}
          {movie.genres.length > 0 && <> · {movie.genres.join(", ")}</>}
        </div>

        <fieldset className="rating" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              className={`star ${movie.rating && star <= movie.rating ? "filled" : ""}`}
              onClick={() => setRating(star)}
              aria-label={`${star} star${star > 1 ? "s" : ""}`}
            >
              ★
            </button>
          ))}
          {movie.rating == null && <span className="muted rating-hint">unrated</span>}
        </fieldset>

        <input
          className="tags-input"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          onBlur={saveText}
          placeholder="tags, comma separated"
          aria-label="Tags"
        />

        <textarea
          className="note-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveText}
          placeholder="Your note about this film in this collection…"
          aria-label="Note"
          rows={2}
        />

        {dirty && (
          <button type="button" className="save-note" onClick={saveText} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </li>
  );
}
