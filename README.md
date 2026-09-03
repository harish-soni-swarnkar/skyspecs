# skyspecs — movie collection curator

Named collections, TMDB search to add films, per-collection notes/tags/ratings, and a few stats on whatever's in the list.

SkySpecs Software Engineer (2026) take-home.

## Stack

pnpm workspace:

- `packages/tmdb` — my own TMDB wrapper (search + movie details). Not an npm client.
- `packages/contracts` — the wire types both apps import, so they can't drift.
- `apps/api` — Fastify + Postgres. Browser never talks to TMDB.
- `apps/web` — Vite / React / TanStack Query.

TypeScript, Zod at the edges, SQL by hand. Why that mix is in [docs/DECISIONS.md](docs/DECISIONS.md). Their stack is JS/TS, React, Node, GraphQL, Postgres, AWS. I kept most of that and skipped GraphQL (decision 3). Gates: Biome (lint + format), coverage thresholds, and CI (`.github/workflows/ci.yml`) on a Postgres service.

## Run it

Need Node 20+, pnpm 10 (pinned via `packageManager`), and Postgres. TMDB token is free: https://www.themoviedb.org/settings/api

```bash
pnpm install
pnpm start          # .env, Postgres via compose, migrate, API :4000 + web :5173
```

Put `TMDB_ACCESS_TOKEN=…` in `.env` and restart. The process will start without it; search/add won't work until you do.

Already have Postgres? Set `DATABASE_URL` and run `pnpm db:setup && pnpm dev`. Compose is only for the database (port 5433, user/pass/db `skyspecs`). Local dev doesn't need Docker for the app — there's a `apps/api/Dockerfile` (built + smoke-tested) as the concrete deploy artifact behind [docs/OPERATING.md](docs/OPERATING.md), not something you run to develop.

```bash
pnpm lint          # biome
pnpm typecheck     # all four packages
pnpm test          # unit; add integration when the DB is up (pnpm bootstrap)
pnpm test:coverage # with thresholds — CI runs this against a Postgres service
```

There's a `Makefile` wrapping these too (`make help`).

## API

`/users` · `/search` · `/collections` · `/collections/:id` · `/collections/:id/stats` · `/collections/:id/movies` (+ PATCH/DELETE on a movie) · `/images/:size/:file` (poster proxy). Pick a user with `x-user-id`. Walkthrough: [docs/API_DEMO.md](docs/API_DEMO.md).

---

## Decision log

Longer versions in [docs/DECISIONS.md](docs/DECISIONS.md).

1. **How much TMDB to keep locally.** On add I pull details once and copy title, year, runtime, genres, poster onto the join row. I never go back for them. That means stats don't fan out 40 TMDB calls, and a collection still renders if TMDB is sad. It also means my copy can be wrong forever. Re-adding a film refreshes the snapshot and leaves your notes alone. I'd rather defend stale catalog data than a live-fetch waterfall.

2. **Notes live on the join, not on a movies table.** Same film, two collections, two different ratings — that's the brief. So there's no local movie catalog. TMDB owns the film; we own the membership + annotations.

3. **REST instead of GraphQL.** The UI has a handful of screens and they all want the same shapes. GraphQL would be extra schema for no client that actually composes queries. I'd revisit if a second client showed up.

4. **No ORM.** There aren't that many statements. I'd rather read the SQL in review than debug a query builder. Mapping is boring and that's fine.

5. **Multi-user in the schema, not in a login screen.** Every query takes `user_id`. `currentUser.ts` trusts `x-user-id` or falls back to a seeded user. The header switcher in the UI is enough to prove the boundary. Real auth swaps that function.

6. **Postgres, not SQLite.** Matches what they run, and "what dies at 100x" isn't a hypothetical about a file. Cost is you need a running server locally.

## What I'd do with more time

Things I left messy on purpose:

- The repo SQL has integration tests, and there's an HTTP-level e2e (real Postgres, TMDB faked) tying routes → repo → stats. What's missing is a true browser test driving the SPA — that's the next one I'd write.
- Snapshot has no refresh in the UI besides "add the movie again." Fine for four hours, not for a product.
- Collection delete is a second click in the UI; removing a film is one click, no prompt. Errors are still just text. I didn't spend the last hour on toasts.
- Search is page 1. Collections aren't paginated.

If this shipped: login, a worker to refresh snapshots, an e2e smoke test, stats as SQL once lists get big, URLs that survive a refresh. The infra story is [docs/OPERATING.md](docs/OPERATING.md).

## What breaks first at 100x

(50k people, fat collections, not me clicking around.)

- Add-movie waits on TMDB every time. The client retries transient blips with backoff, but that doesn't help *sustained* rate limiting — cache `tmdb_id` → details on our side, or queue the add.
- Stats walk the whole collection in JS. At a few thousand films that's a dumb full read. Move the aggregates into SQL.
- `GET /collections/:id` dumps every movie. Paginate it.
- Default `pg` pool, one Node process. Tune the pool, run more instances.

The schema is not the interesting failure. The sync TMDB hop and "load everything" reads are.

## Notes

- **Time:** the core is about four hours — the three layers, the snapshot decision, the first tests. The tooling (Biome, coverage gates, CI, a Makefile, a Docker image) and the extras (image proxy, multi-user switcher, contracts package) sit beyond that box; they're quality I'd stand behind, not features the brief needed. The brief says smaller-and-deliberate beats sprawling, so I'll name the line plainly: asked to fit four hours flat, I'd keep the tests and drop the switcher and image proxy first.
- **AI:** Cursor while I was writing this. Boilerplate, tests, type noise. I did not one-shot the app from the PDF. Snapshot-on-add vs live fetch, join-row annotations, and REST vs GraphQL are calls I made and can walk through.
- **Ambiguous bits:**
  - Copying TMDB: I treated that as "pick a freshness story." I picked snapshot-at-add.
  - Stats: runtime total, genres, avg rating, year span. That's what I'd look at on a rainy-Sunday list.
  - Multiple users, no auth spec: model it, don't build login.
  - "URL doesn't have to change": I took that as permission to skip a router. Two screens, state in memory.

Architecture sketches: [docs/HLD.md](docs/HLD.md), [docs/LLD.md](docs/LLD.md). Running it in prod — gates in the repo, cloud deploy described: [docs/OPERATING.md](docs/OPERATING.md).
