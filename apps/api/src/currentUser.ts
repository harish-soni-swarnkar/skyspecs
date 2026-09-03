import type { FastifyRequest } from "fastify";

/** The seeded default user (see migration 001). */
export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

/** Who we act as: `x-user-id` or the seeded default. Not real auth. */
export function currentUserId(req: FastifyRequest): string {
  const header = req.headers["x-user-id"];
  return typeof header === "string" && header.length > 0 ? header : DEFAULT_USER_ID;
}
