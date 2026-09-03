import type { z } from "zod";
import { TmdbError, errorFromStatus } from "./errors.js";
import {
  type MovieDetails,
  type MovieSearchPage,
  tmdbMovieDetailsSchema,
  tmdbSearchResponseSchema,
  toMovieDetails,
  toMovieSearchResult,
} from "./schemas.js";

export interface TmdbClientOptions {
  /** TMDB v4 read access token (Bearer). Required. */
  accessToken: string;
  /** Override for tests or a proxy. Defaults to the public TMDB v3 base. */
  baseUrl?: string;
  /** Injectable for testing; defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Per-request timeout in ms. Defaults to 8000. */
  timeoutMs?: number;
  /** Extra attempts on transient failures (network / timeout / 429 / 5xx). Defaults to 2. */
  maxRetries?: number;
  /** Backoff between retries in ms (multiplied by attempt number). Defaults to 250; 0 in tests. */
  retryDelayMs?: number;
}

const DEFAULT_BASE_URL = "https://api.themoviedb.org/3";
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Transient = worth retrying: the request didn't complete, we were rate-limited, or TMDB 5xx'd.
// Permanent (auth, not_found, a bad body) is thrown straight through.
function isRetryable(err: unknown): boolean {
  if (!(err instanceof TmdbError)) return false;
  return (
    err.kind === "network" ||
    err.kind === "rate_limited" ||
    (err.kind === "upstream" && (err.status ?? 0) >= 500)
  );
}

/** TMDB search + details. Auth, timeouts, retries, and response parsing stay in here. */
export class TmdbClient {
  #accessToken: string;
  #baseUrl: string;
  #fetch: typeof fetch;
  #timeoutMs: number;
  #maxRetries: number;
  #retryDelayMs: number;

  constructor(options: TmdbClientOptions) {
    if (!options.accessToken) {
      throw new Error("TmdbClient requires an accessToken");
    }
    this.#accessToken = options.accessToken;
    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.#retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  /** Search movies by free-text query. Page defaults to 1. */
  async searchMovies(query: string, page = 1): Promise<MovieSearchPage> {
    const trimmed = query.trim();
    if (!trimmed) {
      // Don't bother TMDB with whitespace.
      return { page: 1, totalPages: 0, totalResults: 0, results: [] };
    }
    const raw = await this.#request(
      "/search/movie",
      { query: trimmed, page: String(page), include_adult: "false" },
      tmdbSearchResponseSchema,
    );
    return {
      page: raw.page,
      totalPages: raw.total_pages,
      totalResults: raw.total_results,
      results: raw.results.map(toMovieSearchResult),
    };
  }

  /** Fetch full details for one movie, including the fields we snapshot (runtime, genres). */
  async getMovie(tmdbId: number): Promise<MovieDetails> {
    const raw = await this.#request(`/movie/${tmdbId}`, {}, tmdbMovieDetailsSchema);
    return toMovieDetails(raw);
  }

  async #request<T>(path: string, params: Record<string, string>, schema: z.ZodType<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.#attempt(path, params, schema);
      } catch (err) {
        if (attempt >= this.#maxRetries || !isRetryable(err)) throw err;
        if (this.#retryDelayMs > 0) await sleep(this.#retryDelayMs * (attempt + 1));
      }
    }
  }

  async #attempt<T>(path: string, params: Record<string, string>, schema: z.ZodType<T>): Promise<T> {
    const url = new URL(this.#baseUrl + path);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

    let response: Response;
    try {
      response = await this.#fetch(url, {
        headers: {
          Authorization: `Bearer ${this.#accessToken}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    } catch (cause) {
      const aborted = cause instanceof Error && cause.name === "AbortError";
      throw new TmdbError(
        "network",
        aborted ? `TMDB request timed out after ${this.#timeoutMs}ms` : "TMDB request failed",
        { cause },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw errorFromStatus(response.status, await response.text().catch(() => ""));
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (cause) {
      throw new TmdbError("invalid_response", "TMDB returned a non-JSON body", { cause });
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new TmdbError("invalid_response", `TMDB response failed validation: ${parsed.error.message}`, {
        cause: parsed.error,
      });
    }
    return parsed.data;
  }
}

export function createTmdbClient(options: TmdbClientOptions): TmdbClient {
  return new TmdbClient(options);
}
