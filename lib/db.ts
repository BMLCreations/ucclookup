// ============================================================================
// Data access layer — Supabase Postgres (production).
// Every feature query is plain SQL run through q(); the database is Supabase.
// Connect via the Supabase "Transaction pooler" connection string in
// DATABASE_URL (Project Settings -> Database -> Connection string -> URI).
// ============================================================================
import "server-only";
import postgres from "postgres";

const g = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };

function client() {
  if (!g.__sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // prepare:false is required for Supabase's transaction pooler (Supavisor).
    g.__sql = postgres(url, { prepare: false, ssl: "require" });
  }
  return g.__sql;
}

// Run a parameterized SQL query ($1, $2, ...) and return rows.
export async function q<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const rows = await client().unsafe(sql, params as never[]);
  return rows as unknown as T[];
}
