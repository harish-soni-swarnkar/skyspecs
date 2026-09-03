import { Pool } from "pg";
import { config } from "../config.js";

/** One shared connection pool for the process. */
export const pool = new Pool({ connectionString: config.databaseUrl });
