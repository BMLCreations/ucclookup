// Simple DB-backed rate limiter (serverless-safe: one atomic upsert per check).
// Returns true if the action is allowed, false if the bucket is over its limit
// for the current window. Used to throttle login/signup attempts.
import "server-only";
import { headers } from "next/headers";
import { q } from "./db";

export async function rateLimit(bucket: string, limit: number, windowSec: number): Promise<boolean> {
  const rows = await q<{ count: number }>(
    `INSERT INTO rate_limits (bucket, count, reset_at)
     VALUES ($1, 1, now() + ($2 * interval '1 second'))
     ON CONFLICT (bucket) DO UPDATE SET
       count    = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at < now() THEN now() + ($2 * interval '1 second') ELSE rate_limits.reset_at END
     RETURNING count`,
    [bucket, windowSec],
  );
  return (rows[0]?.count ?? 1) <= limit;
}

// Best-effort client IP from the proxy headers (Vercel sets x-forwarded-for).
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") || "").split(",")[0].trim()
    || h.get("x-real-ip")
    || "unknown";
}
