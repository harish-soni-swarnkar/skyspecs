import { getUserId } from "./session.js";

export const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Don't send content-type on GET/DELETE — Fastify then tries to parse an empty JSON body.
  const headers: Record<string, string> = {
    "x-user-id": getUserId(),
    ...(init?.headers as Record<string, string>),
  };
  if (init?.body != null) headers["content-type"] = "application/json";
  const res = await fetch(BASE_URL + path, { ...init, headers });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new ApiError(res.status, body.message ?? body.error ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Poster via our API proxy, not TMDB's CDN. */
export function posterUrl(
  posterPath: string | null,
  size: "w200" | "w500" | "original" = "w500",
): string | null {
  if (!posterPath) return null;
  return `${BASE_URL}/images/${size}${posterPath}`;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: (path: string) => request<void>(path, { method: "DELETE" }),
};
