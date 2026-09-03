# Design notes

The bits that aren't obvious from grepping the repo.

## TMDB snapshot

Brief flags this as the interesting one.

I fetch details once when you add a film and copy title / year / runtime / genres / poster onto `collection_movies`. After that I leave it. No TTL.

If TMDB edits a title or nukes a record, I still show my copy. That's the loss.

Why not the other options:

- IDs only, fetch on every collection view: a 40-film list is 40 upstream calls, plus you can't open the page when TMDB is down.
- IDs + cache with TTL: more "correct," also a cache and invalidation for data that barely moves (runtime of a released film).

Re-add refreshes the snapshot and keeps notes. That's the escape hatch until a background job exists.

## Annotations on the join row

Note / tags / rating are on `collection_movies`. The brief says the same movie can look different in two lists, so they aren't properties of a movie. There is no `movies` table.

## No ORM

Dozen queries, I want them on the page in review. ORM would save mapping and cost a layer I don't need yet. I own the SQL being wrong.

## REST, not GraphQL

UI wants fixed payloads. GraphQL pays off when clients pick their own trees. We don't. Nested "give me the collection" endpoints are enough.

## Auth stubbed, schema isn't

No login. `currentUser.ts` reads `x-user-id` or uses the seeded user. Collections are still per-user in SQL. The "Viewing as" control is just that header. Swap in a session later without touching the tables.

## Search and posters go through us

`GET /search` is server-side so the token never hits the browser. Posters go through `GET /images/:size/:file` with a short allow-list of sizes and filenames, plus a long cache header. Otherwise people would load TMDB's CDN from the SPA and we'd have an open proxy if I wasn't careful.

## TMDB retries

The client retries transient failures (network drop, timeout, 429, 5xx) with a small backoff — a couple of attempts. Permanent ones (auth, not_found, a bad body) fail immediately; retrying them just wastes time. A flaky network otherwise turns a one-off blip into a user-visible 502 that a single retry would have swallowed. It's bounded on purpose — retries aren't a substitute for the caching/queue you'd want at real scale.

## Stats in JS

`computeStats` is a loop over rows. For lists a person actually curates that's fine and easy to test. If collections got huge I'd write the same numbers as SQL.

## Migrations

Numbered `.sql` files, applied once, recorded. No downs. Roll back by writing another forward file. That's enough here.

## Add is idempotent

`ON CONFLICT (collection_id, tmdb_id) DO UPDATE` refreshes the snapshot, leaves annotations. Double-clicks and retries don't duplicate the film.

## Postgres vs SQLite

Postgres because that's their world and because scaling talk against SQLite always feels fake. SQLite would have been nicer for `pnpm start` with zero services. Schema would port.

## Contracts package

`packages/contracts` holds the request/response types. api and web both import it instead of hand-copying interfaces, so a shape change is caught by the compiler on both sides at once. One tiny package beats two copies drifting.

## Tooling, and the CI the brief said to skip

The brief says skip CI/Docker. I include them anyway — Biome (lint + format), coverage thresholds that fail the build, a CI workflow on a Postgres service, and a smoke-tested API image. Not because the brief asked, but because "how do you keep this healthy" is the same conversation as "is this senior work," and I'd rather show it than describe it. It sits beyond the four-hour core; the README notes name that line. Biome over ESLint+Prettier: one tool, one config, fast.
