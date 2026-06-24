// Free-plan limits + daily search quota. Reuses the rate_limits table, keyed
// per user per UTC day, so Free users get a fixed number of searches/day.
import "server-only";
import { q } from "./db";

export const FREE_DAILY_SEARCHES = 2;
export const FREE_LEADGEN_ROWS = 8;

// Count one search against today's quota; returns whether it's still allowed.
export async function consumeSearch(userId: number): Promise<{ allowed: boolean; used: number; limit: number }> {
  const rows = await q<{ count: number }>(
    `INSERT INTO rate_limits (bucket, count, reset_at)
     VALUES ('search:' || $1::text || ':' || to_char(now(),'YYYY-MM-DD'), 1, date_trunc('day', now()) + interval '1 day')
     ON CONFLICT (bucket) DO UPDATE SET count = rate_limits.count + 1
     RETURNING count`,
    [userId],
  );
  const used = rows[0]?.count ?? 1;
  return { allowed: used <= FREE_DAILY_SEARCHES, used, limit: FREE_DAILY_SEARCHES };
}
