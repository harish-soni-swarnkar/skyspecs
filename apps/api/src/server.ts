import cors from "@fastify/cors";
import { type MovieDetails, type MovieSearchPage, TmdbError } from "@skyspecs/tmdb";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { currentUserId } from "./currentUser.js";
import type { CollectionsRepository } from "./db/repository.js";
import type { UsersRepository } from "./db/usersRepository.js";
import { computeStats } from "./domain/stats.js";

/** What the API needs from TMDB. Stub this in tests. */
export interface TmdbGateway {
  searchMovies(query: string, page?: number): Promise<MovieSearchPage>;
  getMovie(tmdbId: number): Promise<MovieDetails>;
}

export interface ServerDeps {
  repo: CollectionsRepository;
  users: UsersRepository;
  tmdb: TmdbGateway;
  /** how the poster proxy reaches TMDB; injectable so the route is testable */
  imageFetch?: typeof fetch;
}

const createCollectionBody = z.object({ name: z.string().trim().min(1).max(200) });
const createUserBody = z.object({ name: z.string().trim().min(1).max(100) });
const POSTER_SIZES = new Set(["w200", "w500", "original"]);
const addMovieBody = z.object({ tmdbId: z.number().int().positive() });
const annotationsBody = z
  .object({
    note: z.string().max(2000).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
    rating: z.number().int().min(1).max(5).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Provide at least one field to update" });
const searchQuery = z.object({
  query: z.string().trim().min(1),
  page: z.coerce.number().int().min(1).max(1000).optional(),
});

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  const imageFetch = deps.imageFetch ?? globalThis.fetch;
  app.register(cors, { origin: true });

  // Map known errors to HTTP.
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof z.ZodError) {
      return reply.status(422).send({ error: "invalid_request", issues: error.issues });
    }
    if (error instanceof TmdbError) {
      const status = error.kind === "not_found" ? 404 : error.kind === "rate_limited" ? 429 : 502;
      return reply.status(status).send({ error: `tmdb_${error.kind}`, message: error.message });
    }
    // Fastify 4xx (empty JSON body, etc.) — don't turn those into 500s.
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({ error: "bad_request", message: (error as Error).message });
    }
    console.error("[api] unhandled error:", error);
    return reply.status(500).send({ error: "internal_error" });
  });

  app.get("/health", async () => ({ ok: true }));

  // Frontend sends the chosen user as `x-user-id`.
  app.get("/users", async () => deps.users.list());
  app.post("/users", async (req, reply) => {
    const { name } = createUserBody.parse(req.body);
    return reply.status(201).send(await deps.users.create(name));
  });

  // Poster proxy. Size + filename only so this isn't an open proxy.
  app.get("/images/:size/:file", async (req, reply) => {
    const { size, file } = req.params as { size: string; file: string };
    if (!POSTER_SIZES.has(size) || !/^[A-Za-z0-9]+\.(jpg|png|webp)$/.test(file)) {
      return reply.status(400).send({ error: "bad_image_request" });
    }
    const upstream = await imageFetch(`https://image.tmdb.org/t/p/${size}/${file}`);
    if (!upstream.ok) return reply.status(upstream.status === 404 ? 404 : 502).send();
    reply.header("content-type", upstream.headers.get("content-type") ?? "image/jpeg");
    reply.header("cache-control", "public, max-age=86400, immutable"); // posters are immutable
    return reply.send(Buffer.from(await upstream.arrayBuffer()));
  });

  // Search stays on the server so the token never hits the browser.
  app.get("/search", async (req) => {
    const { query, page } = searchQuery.parse(req.query);
    return deps.tmdb.searchMovies(query, page);
  });

  app.get("/collections", async (req) => {
    return deps.repo.list(currentUserId(req));
  });

  app.post("/collections", async (req, reply) => {
    const { name } = createCollectionBody.parse(req.body);
    const collection = await deps.repo.create(currentUserId(req), name);
    return reply.status(201).send(collection);
  });

  app.get("/collections/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const collection = await deps.repo.getWithMovies(currentUserId(req), id);
    if (!collection) return reply.status(404).send({ error: "collection_not_found" });
    return collection;
  });

  app.delete("/collections/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = await deps.repo.delete(currentUserId(req), id);
    if (!deleted) return reply.status(404).send({ error: "collection_not_found" });
    return reply.status(204).send();
  });

  app.get("/collections/:id/stats", async (req, reply) => {
    const { id } = req.params as { id: string };
    const collection = await deps.repo.getWithMovies(currentUserId(req), id);
    if (!collection) return reply.status(404).send({ error: "collection_not_found" });
    return computeStats(collection.movies);
  });

  // Fetch details, copy onto the join row.
  app.post("/collections/:id/movies", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { tmdbId } = addMovieBody.parse(req.body);
    const details = await deps.tmdb.getMovie(tmdbId);
    const movie = await deps.repo.addMovie(currentUserId(req), id, details);
    if (!movie) return reply.status(404).send({ error: "collection_not_found" });
    return reply.status(201).send(movie);
  });

  app.delete("/collections/:id/movies/:tmdbId", async (req, reply) => {
    const { id, tmdbId } = req.params as { id: string; tmdbId: string };
    const removed = await deps.repo.removeMovie(currentUserId(req), id, Number(tmdbId));
    if (!removed) return reply.status(404).send({ error: "movie_not_found" });
    return reply.status(204).send();
  });

  app.patch("/collections/:id/movies/:tmdbId", async (req, reply) => {
    const { id, tmdbId } = req.params as { id: string; tmdbId: string };
    const patch = annotationsBody.parse(req.body);
    const movie = await deps.repo.updateAnnotations(currentUserId(req), id, Number(tmdbId), patch);
    if (!movie) return reply.status(404).send({ error: "movie_not_found" });
    return movie;
  });

  return app;
}
