# UCClookup — California UCC lead intelligence

Next.js 16 + Tailwind + Supabase (Postgres). Three tools over California UCC +
business-entity data: a competitor-funder lead feed, a stacking detector, and an
owner reverse-lookup (company → owner → their other companies).

## Going live (Supabase + Vercel)

**1. Create a Supabase project** (free) at https://app.supabase.com.

**2. Get the connection string.** Project Settings → Database → Connection string
→ **URI**, using the **Transaction pooler** host (`…pooler.supabase.com:6543`).
Copy `web/.env.local.example` to `web/.env.local` and paste it into `DATABASE_URL`
(fill in your DB password).

**3. Load the data into Supabase** (one time, from your machine):

```bash
cd web
npm install
npm run load     # creates the schema + loads the California sample into Supabase
```

**4. Push to GitHub & import to Vercel.**
- Push this `web/` folder to a GitHub repo.
- At https://vercel.com/new import that repo.
- Add the **`DATABASE_URL`** environment variable (same value as `.env.local`).
- Deploy. Done — it's a live URL, no localhost.

Every push to `main` redeploys automatically.

## Where things live
- `lib/db.ts` — the Supabase connection (the one swap-point).
- `lib/features.ts` — the three features as SQL.
- `db/schema.sql`, `db/exclusions.sql` — schema + junk/institution filters.
- `scripts/load-supabase.mjs` — one-time data loader (`npm run load`).
- `app/` — dashboard, `/feed`, `/stacking`, `/search`.

## Updating data later
Re-run `npm run load` (it resets and reloads). When the $100 master-unload
files replace the sample folders, the same command loads the full history.
