# Running this for real

Brief says skip deployment and talk about it. The gates that make a deploy safe are in the repo
(CI, lint, coverage, a buildable image). The cloud itself is described here, not built — that's
the follow-up.

## What's in the repo vs. described

**In the repo:** Biome (lint + format), coverage thresholds enforced in `vitest.config.ts`,
integration tests against a real Postgres, a CI workflow, a smoke-tested `apps/api/Dockerfile`, a
`Makefile`. **Described below, not built:** the actual cloud — RDS, ECS/CloudFront, secrets,
autoscaling. That's the part the brief said to talk through, and building it is throwaway work
against a take-home.

## CI (`.github/workflows/ci.yml`)

On every push / PR, against an ephemeral `postgres:16` service:

1. `pnpm install --frozen-lockfile`
2. `pnpm lint` — Biome
3. `pnpm typecheck` — all four packages
4. `pnpm test:coverage` — unit **and** integration (the suite that self-skips locally runs here,
   because the service Postgres is reachable), with the coverage thresholds as a hard gate
5. `pnpm build` — the web app

The integration tests gate on a reachable DB, so CI just points `TEST_DATABASE_URL` at the service — no separate test code for it.

## Packaging & deploy (their stack is AWS)

- **web** — static build to S3 + CloudFront. It's just assets.
- **api** — the multi-stage `apps/api/Dockerfile` (builds + boots), to ECS/Fargate (or App
  Runner) behind an ALB. Stateless, so scale horizontally.
- **db** — RDS Postgres, not a container. Managed backups, PITR, a read replica when reads dominate.
- **migrations** — run `db:setup`'s migrate step as a release task before the new version takes
  traffic. Forward-only; a bad migration is a new forward migration, not a down.

## Config & secrets

`DATABASE_URL` and `TMDB_ACCESS_TOKEN` come from the platform (SSM Parameter Store / Secrets
Manager), never baked into the image. The API boots without the TMDB token and degrades
only the two routes that need it — handy for a smoke deploy before secrets are wired.

## Observability

- Turn on the pino logger (it's off for a quiet local run), one structured line per request with a
  request id. Unexpected 500s hit stderr.
- Metrics: RED per route (rate, errors, duration), plus a counter on `tmdb_*` error kinds — that's
  the early-warning for TMDB trouble.
- Traces around the TMDB hop and the DB, so a slow add-movie is attributable.
- Error tracking (Sentry) on both apps.
- SLOs: p95 on `GET /collections/:id` and `/stats`; error-rate budget on the TMDB-backed routes.

## Where it breaks at scale, and the fix

Same as the README's 100x list, with the plan:

- **Add-movie is a synchronous TMDB call.** First to hit the rate limit. Add a shared
  details-by-`tmdb_id` cache (Redis) so popular films don't re-fetch; queue adds if bursty.
- **Stats loop in JS + load-everything reads.** Move aggregates into SQL; paginate
  `GET /collections/:id`. Add the indexes for the real access patterns.
- **Connections.** Put PgBouncer in front of RDS; the default `pg` pool per task won't hold at 50k
  users.
- **Snapshots go stale with no refresh.** A background worker re-pulls details on a schedule / on
  cache miss — the piece I most want if this shipped.

## Security to close before real users

- Replace the `x-user-id` header with real auth (session/JWT). It's a documented seam —
  `currentUser.ts` is the only thing that changes. Today the boundary is nominal and spoofable.
- Rate-limit the API, tighten CORS from `origin: true` to the known web origin.
- The image proxy is constrained to fixed sizes + filename-only paths so it can't be turned
  into an open proxy; keep it that way.

## Rollback & data

Stateless api → blue/green or rolling, roll back by redeploying the prior image. Data safety is
RDS backups + PITR. Because movie data is a snapshot of TMDB, the durable state we actually own is
small (collections + annotations) — losing the snapshot is re-fetchable, losing annotations is not,
so that's what backups are really protecting.
