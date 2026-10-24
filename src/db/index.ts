import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Reuse one connection pool across hot reloads in dev and warm serverless invocations.
const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

function makeClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // postgres() connects lazily, so the build still works; the first query fails with this hint.
    console.warn("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  // prepare:false keeps it compatible with Supabase / Neon connection poolers
  return postgres(url ?? "postgres://missing-database-url@localhost:1/none", { max: 5, prepare: false });
}

export const pg = globalForDb.pg ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForDb.pg = pg;

export const db = drizzle(pg, { schema });
export * from "./schema";
