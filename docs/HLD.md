# High-level

A pnpm workspace: TMDB wrapper, Fastify API + Postgres, React SPA, and a shared types package the api and web both import. Browser only talks to our API.

```mermaid
flowchart LR
    user["Browser"] -->|"/collections, /search"| api["Fastify API"]
    api --> repo["SQL repo"]
    repo --> db[("Postgres")]
    api --> lib["TMDB lib"]
    lib --> tmdb["TMDB v3"]
```

Token stays in the API env. Posters proxy through the API too (`GET /images/:size/:file`), so the browser never hits TMDB's CDN either. Identity is a `/users` list plus an `x-user-id` header — no login.

## Search

```mermaid
sequenceDiagram
    participant W as Web
    participant A as API
    participant L as TMDB lib
    participant T as TMDB
    W->>A: GET /search?query=inception
    A->>L: searchMovies
    L->>T: GET /3/search/movie
    T-->>L: JSON
    L-->>A: mapped results
    A-->>W: 200
```

## Add movie (snapshot)

```mermaid
sequenceDiagram
    participant W as Web
    participant A as API
    participant L as TMDB lib
    participant DB as Postgres
    W->>A: POST .../movies { tmdbId }
    A->>L: getMovie
    L-->>A: details
    A->>DB: insert snapshot on collection_movies
    A-->>W: 201
```

Details land on the join row at add time. We don't refetch later. See [DECISIONS.md](DECISIONS.md).

## Stats

```mermaid
sequenceDiagram
    participant W as Web
    participant A as API
    participant DB as Postgres
    W->>A: GET .../stats
    A->>DB: select movies for collection
    Note over A: computeStats in process
    A-->>W: 200
```

No TMDB on this path.

## Schema

```mermaid
erDiagram
    USERS ||--o{ COLLECTIONS : owns
    COLLECTIONS ||--o{ COLLECTION_MOVIES : contains
    USERS {
        uuid id PK
        text name
    }
    COLLECTIONS {
        uuid id PK
        uuid user_id FK
        text name
        timestamptz created_at
    }
    COLLECTION_MOVIES {
        uuid id PK
        uuid collection_id FK
        int tmdb_id
        text title
        int release_year
        int runtime_minutes
        text_array genres
        text poster_path
        timestamptz snapshot_at
        text note
        text_array tags
        int rating
        timestamptz added_at
    }
```

`collection_movies` is membership + snapshot + annotations. Unique `(collection_id, tmdb_id)`. Same TMDB id in another collection is another row.

[LLD.md](LLD.md) for internals.
