import Link from "next/link";
import { PageHeader, DataTable, TaxBadge, UpgradeWall, LoginGate } from "../components";
import { getSessionUser } from "@/lib/auth";
import { consumeSearch, FREE_WEEKLY_SEARCHES, FREE_LEADGEN_ROWS } from "@/lib/usage";
import {
  searchBusinesses, searchIndividuals,
  type BusinessRow, type IndividualRow, type SearchWindow,
} from "@/lib/features";

export const dynamic = "force-dynamic";

const WINDOWS: { v: SearchWindow; label: string }[] = [
  { v: "all", label: "All time" },
  { v: "12mo", label: "Last 12 months" },
  { v: "6mo", label: "Last 6 months" },
  { v: "3mo", label: "Last 3 months" },
];

const RENEWALS: { v: number; label: string }[] = [
  { v: 0, label: "Any time" },
  { v: 30, label: "Next 30 days" },
  { v: 60, label: "Next 60 days" },
  { v: 90, label: "Next 90 days" },
];

// Discovery starting points — pure filter combinations, no names.
const PRESETS = [
  { label: "Stacked · 3+ funders", href: "/leads?funders=3" },
  { label: "Heavily stacked · 5+ funders", href: "/leads?funders=5" },
  { label: "Active last 6 mo · 3+ filings", href: "/leads?min=3&win=6mo" },
  { label: "Renewing · next 90 days", href: "/leads?renew=90" },
];

function NumField({ name, label, value, min }: { name: string; label: string; value: number; min: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input type="number" name={name} min={min} defaultValue={value}
        className="w-32 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
    </label>
  );
}

function TextField({ name, label, value, placeholder, width }: { name: string; label: string; value: string; placeholder: string; width: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input type="text" name={name} defaultValue={value} placeholder={placeholder}
        className={`${width} rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100`} />
    </label>
  );
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; min?: string; funders?: string; win?: string; state?: string; city?: string; renew?: string }>;
}) {
  const user = await getSessionUser();
  const loggedOut = !user;
  const pro = user?.plan === "pro";

  const sp = await searchParams;
  const type = sp.type === "individuals" ? "individuals" : "businesses";
  const min = Math.max(1, Number(sp.min ?? 1) || 1);
  const minFunders = Math.max(0, Number(sp.funders ?? 0) || 0);
  const win = (["all", "3mo", "6mo", "12mo"].includes(sp.win ?? "") ? sp.win : "all") as SearchWindow;
  const state = (sp.state ?? "").trim();
  const city = (sp.city ?? "").trim();
  const renew = [30, 60, 90].includes(Number(sp.renew)) ? Number(sp.renew) : 0;

  // A "search" = the user actually applied a filter (bare /leads landing doesn't count).
  const didSearch = !!(sp.min || sp.funders || sp.win || sp.state || sp.city || sp.renew || sp.type);
  let overQuota = false;
  let used = 0;
  if (user && !pro && didSearch) {
    const quota = await consumeSearch(user.id);
    overQuota = !quota.allowed;
    used = quota.used;
  }

  const isIndividuals = type === "individuals";
  const canSearch = !!user && !overQuota;
  const [biz, individuals] = await Promise.all([
    canSearch && !isIndividuals ? searchBusinesses({ minFilings: min, minFunders, window: win, state, city, renewingDays: renew }) : Promise.resolve([] as BusinessRow[]),
    canSearch && isIndividuals ? searchIndividuals({ minFilings: min, minFunders, window: win, state, city, renewingDays: renew }) : Promise.resolve([] as IndividualRow[]),
  ]);

  // Free plan only sees the first few rows; the rest is locked.
  const shownBiz = pro ? biz : biz.slice(0, FREE_LEADGEN_ROWS);
  const shownIndividuals = pro ? individuals : individuals.slice(0, FREE_LEADGEN_ROWS);
  const hidden = isIndividuals ? individuals.length - shownIndividuals.length : biz.length - shownBiz.length;

  const winLabel = WINDOWS.find((w) => w.v === win)?.label.toLowerCase();
  const count = isIndividuals ? individuals.length : biz.length;
  const noun = isIndividuals ? (count === 1 ? "individual" : "individuals") : (count === 1 ? "business" : "businesses");

  function tab(t: "businesses" | "individuals", label: string) {
    const params = new URLSearchParams({ type: t, min: String(min), funders: String(minFunders), win });
    if (state) params.set("state", state);
    if (city) params.set("city", city);
    if (renew) params.set("renew", String(renew));
    const active = type === t;
    return (
      <Link href={`/leads?${params.toString()}`}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${active ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"}`}>
        {label}
      </Link>
    );
  }

  return (
    <div>
      <PageHeader
        title="Lead Generation"
        subtitle="Discover prospects you don't already know — filter the full California record set by activity, leverage, and location."
      />

      <div className="mb-4 flex gap-2">
        {tab("businesses", "Businesses")}
        {tab("individuals", "Individuals")}
      </div>

      <form action="/leads" method="get" className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <input type="hidden" name="type" value={type} />
        <div className="flex flex-wrap items-end gap-4">
          <NumField name="min" label="Min filings" value={min} min={1} />
          <NumField name="funders" label="Min funders (stacking)" value={minFunders} min={0} />
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Within</span>
            <select name="win" defaultValue={win}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100">
              {WINDOWS.map((w) => <option key={w.v} value={w.v}>{w.label}</option>)}
            </select>
          </label>
          <TextField name="state" label="State" value={state} placeholder="CA" width="w-24" />
          <TextField name="city" label="City" value={city} placeholder="e.g. Los Angeles" width="w-48" />
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Renewing</span>
            <select name="renew" defaultValue={String(renew)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100">
              {RENEWALS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
            </select>
          </label>
          {!pro && didSearch && !overQuota && (
            <span className="ml-auto self-center text-xs text-slate-400">Free · {used}/{FREE_WEEKLY_SEARCHES} searches this week</span>
          )}
          <button type="submit" className={`${!pro && didSearch && !overQuota ? "" : "ml-auto"} rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:bg-indigo-800`}>
            Generate
          </button>
        </div>
      </form>

      <div className="mb-10 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-400">Quick views:</span>
        {PRESETS.map((p) => (
          <Link key={p.href} href={p.href}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700">
            {p.label}
          </Link>
        ))}
      </div>

      {loggedOut ? (
        <LoginGate />
      ) : overQuota ? (
        <UpgradeWall
          title={`You've used your ${FREE_WEEKLY_SEARCHES} free searches this week`}
          message="Upgrade to Pro for unlimited lead generation, all results, and CSV export."
        />
      ) : (
        <>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            {count} {noun}
            {min > 1 && <> · <span className="text-indigo-700">{min}+</span> filings{win !== "all" && <> in the {winLabel}</>}</>}
            {minFunders > 0 && <> · <span className="text-indigo-700">{minFunders}+</span> distinct funders</>}
            {renew > 0 && <> · <span className="text-indigo-700">renewing within {renew} days</span></>}
            {state && <> · in <span className="text-indigo-700">{state.toUpperCase()}</span></>}
            {city && <> · <span className="text-indigo-700">{city}</span></>}
          </h2>

          {isIndividuals ? (
            <DataTable<IndividualRow>
              rows={shownIndividuals}
              empty="No individuals match these filters."
              columns={[
                { key: "person_name", label: "Individual", className: "font-medium", render: (r) => (
                    <Link href={`/person/${encodeURIComponent(r.person_key)}`} className="font-medium text-indigo-700 hover:underline">{r.person_name}</Link>
                  ) },
                { key: "city", label: "Location", render: (r) => [r.city, r.state].filter(Boolean).join(", ") || "—" },
                { key: "ucc_count", label: "Filings", className: "text-center nums" },
                { key: "active_liens", label: "Active", className: "text-center nums" },
                { key: "distinct_funders", label: "Funders", className: "text-center nums" },
                { key: "tax_liens", label: "Tax liens", className: "text-center", render: (r) => <TaxBadge n={r.tax_liens} /> },
                { key: "next_expiry", label: "Renews", render: (r) => r.next_expiry ?? "—" },
                { key: "last_filing", label: "Last filing" },
              ]}
            />
          ) : (
            <DataTable<BusinessRow>
              rows={shownBiz}
              empty="No businesses match these filters."
              columns={[
                { key: "biz_name", label: "Business", className: "font-medium", render: (r) => (
                    <Link href={`/company/${encodeURIComponent(r.biz_norm)}`} className="font-medium text-indigo-700 hover:underline">{r.biz_name}</Link>
                  ) },
                { key: "city", label: "Location", render: (r) => [r.city, r.state].filter(Boolean).join(", ") || "—" },
                { key: "ucc_count", label: "Filings", className: "text-center nums" },
                { key: "active_liens", label: "Active", className: "text-center nums" },
                { key: "distinct_funders", label: "Funders", className: "text-center nums" },
                { key: "tax_liens", label: "Tax liens", className: "text-center", render: (r) => <TaxBadge n={r.tax_liens} /> },
                { key: "next_expiry", label: "Renews", render: (r) => r.next_expiry ?? "—" },
                { key: "last_filing", label: "Last filing" },
              ]}
            />
          )}

          {hidden > 0 && (
            <div className="mt-3">
              <UpgradeWall
                title={`${hidden} more ${hidden === 1 ? "result is" : "results are"} locked`}
                message={`Free shows the first ${FREE_LEADGEN_ROWS}. Upgrade to Pro to see all ${count} and export them.`}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}