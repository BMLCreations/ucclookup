import Link from "next/link";
import { UpgradeWall, LoginGate } from "../components";
import { SortableTable } from "../sortable-table";
import { getSessionUser } from "@/lib/auth";
import { consumeSearch, FREE_WEEKLY_SEARCHES, FREE_LEADGEN_ROWS } from "@/lib/usage";
import {
  searchBusinesses, searchIndividuals, countBusinesses, countIndividuals,
  type BusinessRow, type IndividualRow, type SearchWindow,
} from "@/lib/features";

export const dynamic = "force-dynamic";

const WINDOWS: { v: SearchWindow; label: string }[] = [
  { v: "all", label: "All time" }, { v: "12mo", label: "Last 12 months" },
  { v: "6mo", label: "Last 6 months" }, { v: "3mo", label: "Last 3 months" },
];
const RENEWALS = [
  { v: 0, label: "Any time" }, { v: 30, label: "Next 30 days" },
  { v: 60, label: "Next 60 days" }, { v: 90, label: "Next 90 days" },
];
const STATES = [{ v: "", label: "All states" }, { v: "CA", label: "California" }];
const PRESETS: { label: string; q: Record<string, string> }[] = [
  { label: "Stacked · 3+ funders", q: { funders: "3" } },
  { label: "Heavily stacked · 5+", q: { funders: "5" } },
  { label: "Active 6 mo · 3+ filings", q: { min: "3", win: "6mo" } },
  { label: "Renewing · 90 days", q: { renew: "90" } },
];

type SP = { type?: string; g?: string; min?: string; funders?: string; win?: string; state?: string; renew?: string; fundedby?: string; filmax?: string; funmax?: string; actmin?: string; actmax?: string; tax?: string };

const TAXMODES = [{ v: 0, label: "Any" }, { v: 1, label: "Has tax liens" }, { v: 2, label: "No tax liens" }];

export default async function LeadGen({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await getSessionUser();
  const loggedOut = !user;
  const pro = user?.plan === "pro";

  const sp = await searchParams;
  const type = sp.type === "individuals" ? "individuals" : "businesses";
  const min = Math.max(1, Number(sp.min ?? 1) || 1);
  const minFunders = Math.max(0, Number(sp.funders ?? 0) || 0);
  const win = (["all", "3mo", "6mo", "12mo"].includes(sp.win ?? "") ? sp.win : "all") as SearchWindow;
  const state = (sp.state ?? "").trim();
  const renew = [30, 60, 90].includes(Number(sp.renew)) ? Number(sp.renew) : 0;
  const fundedby = (sp.fundedby ?? "").trim();
  const filmax = Math.max(0, Number(sp.filmax ?? 0) || 0);
  const funmax = Math.max(0, Number(sp.funmax ?? 0) || 0);
  const actmin = Math.max(0, Number(sp.actmin ?? 0) || 0);
  const actmax = Math.max(0, Number(sp.actmax ?? 0) || 0);
  const tax = [1, 2].includes(Number(sp.tax)) ? Number(sp.tax) : 0;

  // A "generate" sets g=1; presets carry filters directly.
  const didSearch = !!sp.g || min > 1 || minFunders > 0 || win !== "all" || !!state || renew > 0 || !!fundedby || filmax > 0 || funmax > 0 || actmin > 0 || actmax > 0 || tax > 0;

  let overQuota = false, used = 0;
  if (user && !pro && didSearch) {
    const Q = await consumeSearch(user.id);
    overQuota = !Q.allowed; used = Q.used;
  }

  const canSearch = !!user && !overQuota && didSearch;
  const F = { minFilings: min, minFunders, window: win, state, renewingDays: renew, maxFilings: filmax, maxFunders: funmax, minActive: actmin, maxActive: actmax, taxMode: tax };
  let biz: BusinessRow[] = [], inds: IndividualRow[] = [], total = 0;
  if (canSearch) {
    if (type === "businesses") { [biz, total] = await Promise.all([searchBusinesses({ funder: fundedby, ...F }), countBusinesses({ funder: fundedby, ...F })]); }
    else { [inds, total] = await Promise.all([searchIndividuals({ ...F }), countIndividuals({ ...F })]); }
  }

  const cap = <T,>(rows: T[]) => (pro ? rows : rows.slice(0, FREE_LEADGEN_ROWS));
  const shownBiz = cap(biz), shownInds = cap(inds);
  const loaded = type === "businesses" ? shownBiz.length : shownInds.length;
  const hidden = pro ? 0 : total - loaded;

  const winLabel = WINDOWS.find((w) => w.v === win)?.label.toLowerCase();
  const centered = !!user && !didSearch;

  // CSV export URL — same filters as the search.
  const ep = new URLSearchParams({ type });
  if (min > 1) ep.set("min", String(min));
  if (minFunders > 0) ep.set("funders", String(minFunders));
  if (win !== "all") ep.set("win", win);
  if (state) ep.set("state", state);
  if (renew > 0) ep.set("renew", String(renew));
  if (fundedby) ep.set("fundedby", fundedby);
  if (filmax > 0) ep.set("filmax", String(filmax));
  if (funmax > 0) ep.set("funmax", String(funmax));
  if (actmin > 0) ep.set("actmin", String(actmin));
  if (actmax > 0) ep.set("actmax", String(actmax));
  if (tax > 0) ep.set("tax", String(tax));
  const exportHref = `/api/export?${ep.toString()}`;
  const exportCounts = [500, 1000, 2500, 5000].filter((n) => n < total);

  function withParams(over: Record<string, string>) {
    const p = new URLSearchParams();
    const base: Record<string, string> = { type, g: "1", min: String(min), funders: String(minFunders), win, state, renew: String(renew), fundedby, filmax: String(filmax), funmax: String(funmax), actmin: String(actmin), actmax: String(actmax), tax: String(tax), ...over };
    for (const [k, v] of Object.entries(base)) if (v && v !== "0" && !(k === "win" && v === "all")) p.set(k, v);
    return `/leads?${p.toString()}`;
  }
  const typeHref = (t: string) => withParams({ type: t });

  return (
    <div className={centered ? "pt-12 transition-all sm:pt-20" : "transition-all"}>
      <div className="mx-auto max-w-3xl">
        {!didSearch && (
          <div className="mb-6 text-center">
            <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Lead Generation</h1>
            <p className="mx-auto mt-2 max-w-xl text-[15px] leading-relaxed text-slate-500">
              Discover prospects by activity, leverage, location, and renewal timing — set your filters and generate a list.
            </p>
          </div>
        )}

        <div className="mb-4 flex justify-center gap-2">
          {[{ v: "businesses", label: "Businesses" }, { v: "individuals", label: "Individuals" }].map((t) => (
            <Link key={t.v} href={typeHref(t.v)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${type === t.v ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"}`}>
              {t.label}
            </Link>
          ))}
        </div>

        <form action="/leads" method="get" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="g" value="1" />
          <div className="flex flex-wrap items-end justify-center gap-3">
            <Field label="State"><select name="state" defaultValue={state} className={inputCls}>{STATES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}</select></Field>
            <Field label="Min filings"><input type="number" name="min" min={1} defaultValue={min} className={inputCls + " w-20"} /></Field>
            <Field label="Max filings"><input type="number" name="filmax" min={0} defaultValue={filmax || ""} placeholder="Any" className={inputCls + " w-20"} /></Field>
            <Field label="Min funders"><input type="number" name="funders" min={0} defaultValue={minFunders} className={inputCls + " w-20"} /></Field>
            <Field label="Max funders"><input type="number" name="funmax" min={0} defaultValue={funmax || ""} placeholder="Any" className={inputCls + " w-20"} /></Field>
            <Field label="Min active liens"><input type="number" name="actmin" min={0} defaultValue={actmin || ""} placeholder="Any" className={inputCls + " w-20"} /></Field>
            <Field label="Max active liens"><input type="number" name="actmax" min={0} defaultValue={actmax || ""} placeholder="Any" className={inputCls + " w-20"} /></Field>
            <Field label="Tax liens"><select name="tax" defaultValue={String(tax)} className={inputCls}>{TAXMODES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</select></Field>
            <Field label="Renewing"><select name="renew" defaultValue={String(renew)} className={inputCls}>{RENEWALS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}</select></Field>
            {type === "businesses" && <Field label="Funded by"><input name="fundedby" defaultValue={fundedby} placeholder="e.g. Forward Financing" className={inputCls + " w-44"} /></Field>}
            <Field label="Within"><select name="win" defaultValue={win} className={inputCls}>{WINDOWS.map((w) => <option key={w.v} value={w.v}>{w.label}</option>)}</select></Field>
          </div>
          <div className="mt-4 flex justify-center">
            <button type="submit" className="rounded-xl bg-indigo-600 px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">Generate leads</button>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs font-medium text-slate-400">Quick views:</span>
          {PRESETS.map((p) => (
            <Link key={p.label} href={withParams(p.q)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700">{p.label}</Link>
          ))}
        </div>
      </div>

      {(loggedOut || didSearch) && (
        <div className="mt-10">
          {loggedOut ? (
            <LoginGate />
          ) : overQuota ? (
            <UpgradeWall title={`You've used your ${FREE_WEEKLY_SEARCHES} free searches this week`} message="Upgrade to Pro for unlimited lead generation, all results, and CSV export." />
          ) : (
            <>
              {!pro && <div className="mb-3 text-xs text-slate-400">Free plan · {used} of {FREE_WEEKLY_SEARCHES} searches used this week</div>}
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-700">
                  {total.toLocaleString()} {type}
                  {pro && total > loaded && <span className="font-normal text-slate-400"> (showing top {loaded})</span>}
                  {min > 1 && <> · <span className="text-indigo-700">{min}+</span> filings{win !== "all" && <> in the {winLabel}</>}</>}
                  {minFunders > 0 && <> · <span className="text-indigo-700">{minFunders}+</span> funders</>}
                  {actmin > 0 && <> · <span className="text-indigo-700">{actmin}+</span> active liens</>}
                  {tax === 1 && <> · <span className="text-indigo-700">with tax liens</span></>}
                  {tax === 2 && <> · <span className="text-indigo-700">no tax liens</span></>}
                  {renew > 0 && <> · <span className="text-indigo-700">renewing within {renew} days</span></>}
                  {state && <> · in <span className="text-indigo-700">{state.toUpperCase()}</span></>}
                </h2>
                {total > 0 && (pro ? (
                  <details className="relative shrink-0">
                    <summary className="cursor-pointer list-none rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                      ⤓ Export CSV ▾
                    </summary>
                    <div className="absolute right-0 z-10 mt-1 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-xs shadow-lg">
                      {exportCounts.map((n) => (
                        <a key={n} href={`${exportHref}&limit=${n}`} className="block px-4 py-2 text-slate-600 transition hover:bg-slate-50">Top {n.toLocaleString()}</a>
                      ))}
                      <a href={exportHref} className="block px-4 py-2 font-medium text-indigo-600 transition hover:bg-slate-50">All {total.toLocaleString()} <span className="text-slate-400">(up to your monthly limit)</span></a>
                    </div>
                  </details>
                ) : (
                  <Link href="/pricing" className="shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-400 transition hover:border-indigo-300 hover:text-indigo-600">
                    🔒 Export · Pro
                  </Link>
                ))}
              </div>
              {type === "businesses"
                ? <SortableTable kind="business" rows={shownBiz} empty="No businesses match these filters." />
                : <SortableTable kind="individual" rows={shownInds} empty="No individuals match these filters." />}
              {hidden > 0 && (
                <div className="mt-3"><UpgradeWall title={`${hidden} more results are locked`} message={`Free shows the first ${FREE_LEADGEN_ROWS}. Upgrade to Pro to see all ${total} and export them.`} /></div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const inputCls = "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}