import { useState } from "react";
import { useCollections, useCreateCollection, useDeleteCollection } from "../api/hooks.js";

export function CollectionsList({ onOpen }: { onOpen: (id: string) => void }) {
  const collections = useCollections();
  const createCollection = useCreateCollection();
  const deleteCollection = useDeleteCollection();
  const [name, setName] = useState("");
  // Inline two-step confirm instead of window.confirm — which is blocking and doesn't fire in
  // embedded/headless browsers. First click arms; second confirms.
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    createCollection.mutate(trimmed, { onSuccess: () => setName("") });
  };

  return (
    <section>
      <h1>Collections</h1>

      <form className="new-collection" onSubmit={submit}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='Name a collection — e.g. "Rainy Sunday"'
          aria-label="New collection name"
        />
        <button type="submit" disabled={!name.trim() || createCollection.isPending}>
          {createCollection.isPending ? "Creating…" : "Create"}
        </button>
      </form>

      {collections.isLoading && <p className="muted">Loading…</p>}
      {collections.isError && <p className="error">Couldn't load collections. Is the API running?</p>}

      {collections.data && collections.data.length === 0 && (
        <p className="muted">No collections yet. Create your first one above.</p>
      )}

      <ul className="collection-grid">
        {collections.data?.map((c) => (
          <li key={c.id} className="collection-card">
            <button type="button" className="collection-open" onClick={() => onOpen(c.id)}>
              <span className="collection-name">{c.name}</span>
              <span className="muted">
                {c.movieCount} {c.movieCount === 1 ? "film" : "films"}
              </span>
            </button>
            {confirmId === c.id ? (
              <span className="confirm-delete">
                <button
                  type="button"
                  className="danger-link"
                  onClick={() => {
                    deleteCollection.mutate(c.id);
                    setConfirmId(null);
                  }}
                >
                  Confirm delete
                </button>
                <button type="button" className="link" onClick={() => setConfirmId(null)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="danger-link"
                aria-label={`Delete ${c.name}`}
                onClick={() => setConfirmId(c.id)}
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
