import type { Pool } from "pg";
import type { User } from "../domain/types.js";

/** Enough to switch users. Not an identity product. */
export class UsersRepository {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<User[]> {
    const { rows } = await this.pool.query<User>("select id, name from users order by created_at, name");
    return rows;
  }

  async create(name: string): Promise<User> {
    const { rows } = await this.pool.query<User>("insert into users (name) values ($1) returning id, name", [
      name,
    ]);
    return rows[0]!;
  }
}
