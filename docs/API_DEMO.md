# API demo

Hit `http://localhost:4000`. Default user if you omit `x-user-id`.

UUIDs/timestamps in the samples will differ. Poster paths come from TMDB.

## Users

```
GET /users            -> 200 [{ "id": "...", "name": "Default User" }, { "id": "...", "name": "Alex" }]
POST /users {"name":"Sam"}  -> 201 { "id": "...", "name": "Sam" }
```

Send `x-user-id: <id>` on any request to act as that user; omit it for the seeded default. Every
collection is scoped to the user, so a different id sees a different (empty) list.

## Create a collection

```
POST /collections
{ "name": "Rainy Sunday" }
```

`201`

```json
{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "name": "Rainy Sunday",
  "createdAt": "2026-09-02T18:00:00.000Z",
  "movieCount": 0
}
```

## Search (proxied through the API)

```
GET /search?query=inception
```

`200`

```json
{
  "page": 1,
  "totalPages": 1,
  "totalResults": 1,
  "results": [
    {
      "tmdbId": 27205,
      "title": "Inception",
      "releaseYear": 2010,
      "posterPath": "/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
      "overview": "Cobb, a skilled thief who commits corporate espionage...",
      "voteAverage": 8.4
    }
  ]
}
```

## Add a movie (snapshots TMDB details onto the join row)

```
POST /collections/7c9e6679-7425-40de-944b-e07fc1f90ae7/movies
{ "tmdbId": 27205 }
```

`201`

```json
{
  "tmdbId": 27205,
  "title": "Inception",
  "releaseYear": 2010,
  "runtimeMinutes": 148,
  "genres": ["Action", "Science Fiction", "Adventure"],
  "posterPath": "/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
  "snapshotAt": "2026-09-02T18:01:00.000Z",
  "note": "",
  "tags": [],
  "rating": null,
  "addedAt": "2026-09-02T18:01:00.000Z"
}
```

`snapshotAt` records when the copy was taken. Adding the same movie again refreshes the snapshot
and keeps the annotations below.

## Annotate the movie within this collection

```
PATCH /collections/7c9e6679-7425-40de-944b-e07fc1f90ae7/movies/27205
{ "note": "Best on a grey afternoon.", "tags": ["heist", "mind-bender"], "rating": 5 }
```

`200`

```json
{
  "tmdbId": 27205,
  "title": "Inception",
  "runtimeMinutes": 148,
  "genres": ["Action", "Science Fiction", "Adventure"],
  "note": "Best on a grey afternoon.",
  "tags": ["heist", "mind-bender"],
  "rating": 5,
  "addedAt": "2026-09-02T18:01:00.000Z",
  "snapshotAt": "2026-09-02T18:01:00.000Z",
  "releaseYear": 2010,
  "posterPath": "/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg"
}
```

Only the fields sent change. Sending `"rating": null` clears the rating; omitting `rating`
leaves it as-is.

## Read the collection with its movies

```
GET /collections/7c9e6679-7425-40de-944b-e07fc1f90ae7
```

`200`

```json
{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "name": "Rainy Sunday",
  "createdAt": "2026-09-02T18:00:00.000Z",
  "movieCount": 1,
  "movies": [
    {
      "tmdbId": 27205,
      "title": "Inception",
      "releaseYear": 2010,
      "runtimeMinutes": 148,
      "genres": ["Action", "Science Fiction", "Adventure"],
      "note": "Best on a grey afternoon.",
      "tags": ["heist", "mind-bender"],
      "rating": 5,
      "snapshotAt": "2026-09-02T18:01:00.000Z",
      "addedAt": "2026-09-02T18:01:00.000Z",
      "posterPath": "/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg"
    }
  ]
}
```

## Derived stats

```
GET /collections/7c9e6679-7425-40de-944b-e07fc1f90ae7/stats
```

`200`

```json
{
  "movieCount": 1,
  "totalRuntimeMinutes": 148,
  "averageRating": 5,
  "ratedCount": 1,
  "genreBreakdown": [
    { "genre": "Action", "count": 1 },
    { "genre": "Adventure", "count": 1 },
    { "genre": "Science Fiction", "count": 1 }
  ],
  "releaseYearSpan": { "earliest": 2010, "latest": 2010 }
}
```

Computed from the local snapshots — no TMDB call. Movies missing runtime don't count toward the
total; only rated movies feed the average.

## Remove a movie / delete a collection

```
DELETE /collections/:id/movies/27205   -> 204
DELETE /collections/:id                -> 204   (cascades: movies + annotations go too)
```

## Posters

```
GET /images/w200/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg   -> streams the poster
```

Sizes: `w200`, `w500`, `original`. The SPA loads posters from here, not TMDB's CDN.

## Errors

| Request | Response |
|---|---|
| `POST /collections` with `{ "name": "" }` | `422 invalid_request` |
| `GET /search?query=` (blank) | `422 invalid_request` |
| Add a movie to an unknown/unowned collection | `404 collection_not_found` |
| `POST .../movies` with a nonexistent `tmdbId` | `404 tmdb_not_found` |
| Any collection/movie not owned by the current user | `404` |
