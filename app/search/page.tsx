import Link from "next/link";
import { PageHeader, DataTable, TaxBadge, UpgradeWall, LoginGate } from "../components";
import { getSessionUser } from "@/lib/auth";
import { consumeSearch, FREE_WEEKLY_SEARCHES, FREE_LEADGEN_ROWS } from "@/lib/usage";
import {
  searchBusinesses, searchIndividuals, searchFunders,
  type BusinessRow, type IndividualRow, type FunderSearchRow, type SearchWindow,
} from "@/lib/features";

export const dynamic = "force-dynamic";

const WINDOWS: { v: SearchWindow; label: string }[] = [
  { v: "all", label: "All time" },
  { v: "12mo", label: "Last 12 months" },
  { v: "6mo", label: "Last 6 months" },
  { v: "3mo", label: "Last 3 months" },
];
const RENEWALS = [
  { v: 0, label: "Any time" }, { v: 30, label: "Next 30 days" },
  { v: 60, label: "Next 60 days" }, { v: 90, label: "Next 90 days" },
];
const TYPES = [
  { v: "businesses", label: "Businesses" },
  { v: "individuals", label: "Individuals" },
  { v: "funders", label: "Funders" },
];
const PRESETS: { label: string; q: Record<string, string> }[] = [
  { label: "Stacked · 3+ funders", q: { funders: "3" } },
  { label: "Heavily stacked · 5+", q: { funders: "5" } },
  { label: "Active 6 mo · 3+ filings", q: { min: "3", win: "6mo" } },
  { label: "Renewing · 90 days", q: { renew: "90" } },
];

type SP = { type?: string; q?: string; min?: string; funders?: string; win?: string; state?: string; city?: string; renew?: string; fundedby?: string };

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await getSessionUser();
  const loggedOut = !user;
  const pro = user?.plan === "pro";

  const sp = await searchParams;
  const type = sp.type === "individuals" || sp.type === "funders" ? sp.type : "businesses";
  const q = (sp.q ?? "").trim();
  const min = Math.max(1, Number(sp.min ?? 1) || 1);
  const minFunders = Math.max(0, Number(sp.funders ?? 0) || 0);
  const win = (["all", "3mo", "6mo", "12mo"].includes(sp.win ?? "") ? sp.win : "all") as SearchWindow;
  const state = (sp.state ?? "").trim();
  const city = (sp.city ?? "").trim();
  const renew = [30, 60, 90].includes(Number(sp.renew)) ? Number(sp.renew) : 0;
  const fundedby = (sp.fundedby ?? "").trim();

  // Filters are a Pro feature; Free can only search by name.
  const filtersUsed = min > 1 || minFunders > 0 || win !== "all" || !!state || !!city || renew > 0 || !!fundedby;
  const didSearch = !!q || (pro && filtersUsed);

  let overQuota = false;
  let used = 0;
  if (user && !pro && didSearch) {
    const Q = await consumeSearch(user.id);
    overQuota = !Q.allowed;
    used = Q.used;
  }

  const canSearch = !!user && !overQuota;
  const F = pro ? { minFilings: min, minFunders, window: win, state, city, renewingDays: renew } : {};

  let biz: BusinessRow[] = [], inds: IndividualRow[] = [], funders: FunderSearchRow[] = [];
  if (canSearch) {
    if (type === "businesses") biz = await searchBusinesses({ name: q, funder: pro ? fundedby : "", ...F });
    else if (type === "individuals") inds = await searchIndividuals({ name: q, ...F });
    else funders = await searchFunders(q);
  }

  // Free sees only a preview.
  const cap = <T,>(rows: T[]) => (pro ? rows : rows.slice(0, FREE_LEADGEN_ROWS));
  const shownBiz = cap(biz), shownInds = cap(inds), shownFunders = cap(funders);
  const total = type === "businesses" ? biz.length : type === "individuals" ? inds.length : funders.length;
  const hidden = pro ? 0 : total - (type === "businesses" ? shownBiz.length : type === "individuals" ? shownInds.length : shownFunders.length);

  function withParams(over: Record<string, string>) {
    const p = new URLSearchParams();
    const base: Record<string, string> = { type, q, min: String(min), funders: String(minFunders), win, state, city, renew: String(renew), fundedby, ...over };
    for (const [k, v] of Object.entries(base)) if (v && v !== "0" && !(k === "win" && v === "all")) p.set(k, v);
    return `/search?${p.toString()}`;
  }

  const lock = !pro; // filters disabled for Free
  const showLeadFilters = type !== "funders";

  return (
    <div>
      <PageHeader
        title="Search"
        subtitle="Find any business, person, or funder by name — or set filters to discover leads by activity, leverage, and location."
      />

      {/* Type toggle */}
      <div className="mb-4 flex gap-2">
        {TYPES.map((t) => (
          <Link key={t.v} href={withParams({ type: t.v })}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${type === t.v ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"}`}>
            {t.label}
          </Link>
        ))}
      </div>

      <form action="/search" method="get" className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <input type="hidden" name="type" value={type} />
        {/* Search bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="9" r="6" /><path d="m14 14 3 3" strokeLinecap="round" /></svg>
            <input type="text" name="q" defaultValue={q} placeholder={`Search ${type} by name…`}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
          </div>
          <button type="submit" className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">Search</button>
        </div>

        {/* Filters (Pro) */}
        {showLeadFilters && (
          <fieldset disabled={lock} className={lock ? "opacity-60" : ""}>
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
              <Dropdown label="State"><input name="state" defaultValue={state} placeholder="CA" className={inputCls + " w-20"} /></Dropdown>
              <Dropdown label="City"><input name="city" defaultValue={city} placeholder="Los Angeles" className={inputCls + " w-40"} /></Dropdown>
              <Dropdown label="Min filings"><input type="number" name="min" min={1} defaultValue={min} className={inputCls + " w-24"} /></Dropdown>
              <Dropdown label="Within"><select name="win" defaultValue={win} className={inputCls}>{WINDOWS.map((w) => <option key={w.v} value={w.v}>{w.label}</option>)}</select></Dropdown>
              <Dropdown label="Min funders (stacking)"><input type="number" name="funders" min={0} defaultValue={minFunders} className={inputCls + " w-24"} /></Dropdown>
              <Dropdown label="Renewing"><select name="renew" defaultValue={String(renew)} className={inputCls}>{RENEWALS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}</select></Dropdown>
              {type === "businesses" && <Dropdown label="Funded by"><input name="fundedby" defaultValue={fundedby} placeholder="e.g. Forward Financing" className={inputCls + " w-44"} /></Dropdown>}
            </div>
          </fieldset>
        )}
        {showLeadFilters && lock && (
          <Link href="/pricing" className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline">
            🔒 Filters are a Pro feature — upgrade to discover leads by activity, stacking, location &amp; renewals
          </Link>
        )}
      </form>

      {/* Presets (Pro) */}
      {showLeadFilters && pro && (
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-400">Quick views:</span>
          {PRESETS.map((p) => (
            <Link key={p.label} href={withParams(p.q)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700">{p.label}</Link>
          ))}
        </div>
      )}

      {/* Results */}
      {loggedOut ? (
        <LoginGate />
      ) : overQuota ? (
        <UpgradeWall title={`You've used your ${FREE_WEEKLY_SEARCHES} free searches this week`} message="Upgrade to Pro for unlimited searches and full Lead Generation." />
      ) : (
        <>
          {!pro && didSearch && (
            <div className="mb-3 text-xs text-slate-400">Free plan · {used} of {FREE_WEEKLY_SEARCHES} searches used this week</div>
          )}
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{total} {type}{q && <> matching &ldquo;{q}&rdquo;</>}</h2>

          {type === "businesses" && (
            <DataTable<BusinessRow> rows={shownBiz} empty="No businesses match." columns={bizCols} />
          )}
          {type === "individuals" && (
            <DataTable<IndividualRow> rows={shownInds} empty="No individuals match." columns={indCols} />
          )}
          {type === "funders" && (
            <DataTable<FunderSearchRow> rows={shownFunders} empty="No funders match." columns={funderCols} />
          )}

          {hidden > 0 && (
            <div className="mt-3"><UpgradeWall title={`${hidden} more locked`} message={`Free shows the first ${FREE_LEADGEN_ROWS}. Upgrade to Pro to see all ${total} and export them.`} /></div>
          )}
        </>
      )}
    </div>
  );
}

const inputCls = "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100";

function Dropdown({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

const bizCols = [
  { key: "biz_name" as const, label: "Business", className: "font-medium", render: (r: BusinessRow) => <Link href={`/company/${encodeURIComponent(r.biz_norm)}`} className="font-medium text-indigo-700 hover:underline">{r.biz_name}</Link> },
  { key: "city" as const, label: "Location", render: (r: BusinessRow) => [r.city, r.state].filter(Boolean).join(", ") || "—" },
  { key: "ucc_count" as const, label: "Filings", className: "text-center nums" },
  { key: "active_liens" as const, label: "Active", className: "text-center nums" },
  { key: "distinct_funders" as const, label: "Funders", className: "text-center nums" },
  { key: "tax_liens" as const, label: "Tax liens", className: "text-center", render: (r: BusinessRow) => <TaxBadge n={r.tax_liens} /> },
  { key: "next_expiry" as const, label: "Renews", render: (r: BusinessRow) => r.next_expiry ?? "—" },
  { key: "last_filing" as const, label: "Last filing" },
];
const indCols = [
  { key: "person_name" as const, label: "Individual", className: "font-medium", render: (r: IndividualRow) => <Link href={`/person/${encodeURIComponent(r.person_key)}`} className="font-medium text-indigo-700 hover:underline">{r.person_name}</Link> },
  { key: "city" as const, label: "Location", render: (r: IndividualRow) => [r.city, r.state].filter(Boolean).join(", ") || "—" },
  { key: "ucc_count" as const, label: "Filings", className: "text-center nums" },
  { key: "active_liens" as const, label: "Active", className: "text-center nums" },
  { key: "distinct_funders" as const, label: "Funders", className: "text-center nums" },
  { key: "tax_liens" as const, label: "Tax liens", className: "text-center", render: (r: IndividualRow) => <TaxBadge n={r.tax_liens} /> },
  { key: "next_expiry" as const, label: "Renews", render: (r: IndividualRow) => r.next_expiry ?? "—" },
  { key: "last_filing" as const, label: "Last filing" },
];
const funderCols = [
  { key: "funder" as const, label: "Funder", className: "font-medium", render: (r: FunderSearchRow) => <Link href={`/funder/${encodeURIComponent(r.funder_norm)}`} className="font-medium text-indigo-700 hover:underline">{r.funder}</Link> },
  { key: "filings" as const, label: "Liens filed", className: "text-center nums", render: (r: FunderSearchRow) => Number(r.filings).toLocaleString() },
];
