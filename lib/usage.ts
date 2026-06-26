// Free-plan limits + weekly search quota. Reuses the rate_limits table, keyed
// per user per ISO week, so Free users get a fixed number of searches/week.
import "server-only";
import { q } from "./db";

export const FREE_WEEKLY_SEARCHES = 4;
export const FREE_LEADGEN_ROWS = 25;
export const EXPORT_MONTHLY_CAP = 5000; // Pro CSV-export rows per calendar month

// Rows a user has exported this month.
export async function exportUsed(userId: number): Promise<number> {
  const r = await q<{ count: number }>(
    `SELECT count FROM rate_limits WHERE bucket = 'export:' || $1::text || ':' || to_char(now(),'YYYY-MM')`,
    [userId],
  );
  return r[0]?.count ?? 0;
}
// Add n exported rows to this month's tally.
export async function addExport(userId: number, n: number): Promise<void> {
  await q(
    `INSERT INTO rate_limits (bucket, count, reset_at)
     VALUES ('export:' || $1::text || ':' || to_char(now(),'YYYY-MM'), $2, date_trunc('month', now()) + interval '1 month')
     ON CONFLICT (bucket) DO UPDATE SET count = rate_limits.count + $2`,
    [userId, n],
  );
}

// Count one search against this week's quota; returns whether it's still allowed.
export async function consumeSearch(userId: number): Promise<{ allowed: boolean; used: number; limit: number }> {
  const rows = await q<{ count: number }>(
    `INSERT INTO rate_limits (bucket, count, reset_at)
     VALUES ('search:' || $1::text || ':' || to_char(now(),'IYYY-IW'), 1, date_trunc('week', now()) + interval '1 week')
     ON CONFLICT (bucket) DO UPDATE SET count = rate_limits.count + 1
     RETURNING count`,
    [userId],
  );
  const used = rows[0]?.count ?? 1;
  return { allowed: used <= FREE_WEEKLY_SEARCHES, used, limit: FREE_WEEKLY_SEARCHES };
}
