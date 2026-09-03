import type { MovieDetails } from "@skyspecs/tmdb";
import type { Pool } from "pg";
import type { Collection, CollectionMovie, CollectionWithMovies } from "../domain/types.js";

// Every query is scoped by user_id: ownership is enforced in the WHERE clause, never assumed.

interface CollectionRow {
  id: string;
  name: string;
  created_at: Date;
  movie_count: string; // pg returns count() as text
}

interface MovieRow {
  tmdb_id: number;
  title: string;
  release_year: number | null;
  runtime_minutes: number | null;
  genres: string[];
  poster_path: string | null;
  snapshot_at: Date;
  note: string;
  tags: string[];
  rating: number | null;
  added_at: Date;
}

function toCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    movieCount: Number(row.movie_count),
  };
}

function toMovie(row: MovieRow): CollectionMovie {
  return {
    tmdbId: row.tmdb_id,
    title: row.title,
    releaseYear: row.release_year,
    runtimeMinutes: row.runtime_minutes,
    genres: row.genres,
    posterPath: row.poster_path,
    snapshotAt: row.snapshot_at.toISOString(),
    note: row.note,
    tags: row.tags,
    rating: row.rating,
    addedAt: row.added_at.toISOString(),
  };
}

export class CollectionsRepository {
  constructor(private readonly pool: Pool) {}

  async list(userId: string): Promise<Collection[]> {
    const { rows } = await this.pool.query<CollectionRow>(
      `select c.id, c.name, c.created_at, count(cm.id) as movie_count
         from collections c
         left join collection_movies cm on cm.collection_id = c.id
        where c.user_id = $1
        group by c.id
        order by c.created_at desc`,
      [userId],
    );
    return rows.map(toCollection);
  }

  async create(userId: string, name: string): Promise<Collection> {
    const { rows } = await this.pool.query<CollectionRow>(
      `insert into collections (user_id, name)
       values ($1, $2)
       returning id, name, created_at, 0 as movie_count`,
      [userId, name],
    );
    return toCollection(rows[0]!);
  }

  /** Returns false when the collection doesn't exist or isn't owned by this user. */
  async delete(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query("delete from collections where id = $1 and user_id = $2", [
      id,
      userId,
    ]);
    return rowCount === 1;
  }

  async getWithMovies(userId: string, id: string): Promise<CollectionWithMovies | null> {
    const collection = await this.pool.query<CollectionRow>(
      `select c.id, c.name, c.created_at, count(cm.id) as movie_count
         from collections c
         left join collection_movies cm on cm.collection_id = c.id
        where c.id = $1 and c.user_id = $2
        group by c.id`,
      [id, userId],
    );
    if (collection.rowCount === 0) return null;

    const movies = await this.pool.query<MovieRow>(
      `select tmdb_id, title, release_year, runtime_minutes, genres, poster_path,
              snapshot_at, note, tags, rating, added_at
         from collection_movies
        where collection_id = $1
        order by added_at desc`,
      [id],
    );

    return { ...toCollection(collection.rows[0]!), movies: movies.rows.map(toMovie) };
  }

  /** True once we've confirmed the collection belongs to the user — a cheap ownership guard. */
  private async ownsCollection(userId: string, collectionId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query("select 1 from collections where id = $1 and user_id = $2", [
      collectionId,
      userId,
    ]);
    return rowCount === 1;
  }

  /** Snapshot TMDB fields onto the join row. Re-add refreshes snapshot, keeps notes. */
  async addMovie(
    userId: string,
    collectionId: string,
    details: MovieDetails,
  ): Promise<CollectionMovie | null> {
    if (!(await this.ownsCollection(userId, collectionId))) return null;

    const { rows } = await this.pool.query<MovieRow>(
      `insert into collection_movies
         (collection_id, tmdb_id, title, release_year, runtime_minutes, genres, poster_path, snapshot_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (collection_id, tmdb_id) do update
         set title = excluded.title,
             release_year = excluded.release_year,
             runtime_minutes = excluded.runtime_minutes,
             genres = excluded.genres,
             poster_path = excluded.poster_path,
             snapshot_at = now()
       returning tmdb_id, title, release_year, runtime_minutes, genres, poster_path,
                 snapshot_at, note, tags, rating, added_at`,
      [
        collectionId,
        details.tmdbId,
        details.title,
        details.releaseYear,
        details.runtimeMinutes,
        details.genres,
        details.posterPath,
      ],
    );
    return toMovie(rows[0]!);
  }

  async removeMovie(userId: string, collectionId: string, tmdbId: number): Promise<boolean> {
    if (!(await this.ownsCollection(userId, collectionId))) return false;
    const { rowCount } = await this.pool.query(
      "delete from collection_movies where collection_id = $1 and tmdb_id = $2",
      [collectionId, tmdbId],
    );
    return rowCount === 1;
  }

  /** Patch annotations. Only the provided fields change; returns null if the movie isn't found. */
  async updateAnnotations(
    userId: string,
    collectionId: string,
    tmdbId: number,
    patch: { note?: string; tags?: string[]; rating?: number | null },
  ): Promise<CollectionMovie | null> {
    if (!(await this.ownsCollection(userId, collectionId))) return null;

    const { rows } = await this.pool.query<MovieRow>(
      `update collection_movies
          set note = coalesce($3, note),
              tags = coalesce($4, tags),
              rating = case when $5::boolean then $6::integer else rating end
        where collection_id = $1 and tmdb_id = $2
        returning tmdb_id, title, release_year, runtime_minutes, genres, poster_path,
                  snapshot_at, note, tags, rating, added_at`,
      [
        collectionId,
        tmdbId,
        patch.note ?? null,
        patch.tags ?? null,
        // rating is nullable, so a plain coalesce can't express "set to null". A flag says
        // whether rating is part of this patch at all.
        patch.rating !== undefined,
        patch.rating ?? null,
      ],
    );
    return rows.length ? toMovie(rows[0]!) : null;
  }
}
