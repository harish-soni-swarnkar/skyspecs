/** Failures from the TMDB wrapper. Switch on `kind`, not HTTP status. */
export type TmdbErrorKind =
  | "auth" // bad or missing token (401 / 403)
  | "not_found" // 404 — no such movie
  | "rate_limited" // 429
  | "upstream" // any other non-2xx from TMDB (5xx, unexpected 4xx)
  | "network" // request never completed (DNS, timeout, offline)
  | "invalid_response"; // 2xx whose body didn't match the schema we rely on

export class TmdbError extends Error {
  readonly kind: TmdbErrorKind;
  /** HTTP status when there was a response; undefined for network/parse failures. */
  readonly status?: number;

  constructor(kind: TmdbErrorKind, message: string, options?: { status?: number; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "TmdbError";
    this.kind = kind;
    this.status = options?.status;
  }
}

export function errorFromStatus(status: number, body: string): TmdbError {
  switch (status) {
    case 401:
    case 403:
      return new TmdbError("auth", "TMDB rejected the access token", { status });
    case 404:
      return new TmdbError("not_found", "TMDB has no record for this request", { status });
    case 429:
      return new TmdbError("rate_limited", "TMDB rate limit exceeded", { status });
    default:
      return new TmdbError("upstream", `TMDB returned ${status}: ${body.slice(0, 200)}`, { status });
  }
}
