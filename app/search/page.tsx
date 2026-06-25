import Link from "next/link";
import { DataTable, UpgradeWall, LoginGate } from "../components";
import { getSessionUser } from "@/lib/auth";
import { consumeSearch, FREE_WEEKLY_SEARCHES, FREE_LEADGEN_ROWS } from "@/lib/usage";
import {
  searchBusinesses, searchIndividuals, searchFunders,
  type BusinessRow, type IndividualRow, type FunderSearchRow,
} from "@/lib/features";
import { bizCols, indCols, funderCols } from "../result-columns";

export const dynamic = "force-dynamic";

const TYPES = [
  { v: "businesses", label: "Businesses" },
  { v: "individuals", label: "Individuals" },
  { v: "funders", label: "Funders" },
];

export default async function UccSearch({ searchParams }: { searchParams: Promise<{ type?: string; q?: string }> }) {
  const user = await getSessionUser();
  const loggedOut = !user;
  const pro = user?.plan === "pro";

  const sp = await searchParams;
  const type = sp.type === "individuals" || sp.type === "funders" ? sp.type : "businesses";
  const q = (sp.q ?? "").trim();
  const didSearch = !!q;

  let overQuota = false, used = 0;
  if (user && !pro && didSearch) {
    const Q = await consumeSearch(user.id);
    overQuota = !Q.allowed; used = Q.used;
  }

  const canSearch = !!user && !overQuota && didSearch;
  let biz: BusinessRow[] = [], inds: IndividualRow[] = [], funders: FunderSearchRow[] = [];
  if (canSearch) {
    if (type === "businesses") biz = await searchBusinesses({ name: q });
    else if (type === "individuals") inds = await searchIndividuals({ name: q });
    else funders = await searchFunders(q);
  }

  const cap = <T,>(rows: T[]) => (pro ? rows : rows.slice(0, FREE_LEADGEN_ROWS));
  const shownBiz = cap(biz), shownInds = cap(inds), shownFunders = cap(funders);
  const total = type === "businesses" ? biz.length : type === "individuals" ? inds.length : funders.length;
  const shownLen = type === "businesses" ? shownBiz.length : type === "individuals" ? shownInds.length : shownFunders.length;
  const hidden = pro ? 0 : total - shownLen;

  const centered = !!user && !didSearch;
  const typeHref = (t: string) => `/search?${new URLSearchParams({ ...(q ? { q } : {}), type: t }).toString()}`;

  return (
    <div className={centered ? "pt-16 transition-all sm:pt-28" : "transition-all"}>
      <div className="mx-auto max-w-3xl">
        {!didSearch && (
          <div className="mb-6 text-center">
            <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">UCC Search</h1>
            <p className="mx-auto mt-2 max-w-xl text-[15px] leading-relaxed text-slate-500">
              Look up any business, person, or funder by name — then open their full profile.
            </p>
          </div>
        )}

        <div className="mb-4 flex justify-center gap-2">
          {TYPES.map((t) => (
            <Link key={t.v} href={typeHref(t.v)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${type === t.v ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"}`}>
              {t.label}
            </Link>
          ))}
        </div>

        <form action="/search" method="get" className="flex gap-2">
          <input type="hidden" name="type" value={type} />
          <div className="relative flex-1">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="9" r="6" /><path d="m14 14 3 3" strokeLinecap="round" /></svg>
            <input type="text" name="q" defaultValue={q} placeholder={`Search ${type} by name…`}
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
          </div>
          <button type="submit" className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">Search</button>
        </form>
      </div>

      {(loggedOut || didSearch) && (
        <div className="mt-10">
          {loggedOut ? (
            <LoginGate />
          ) : overQuota ? (
            <UpgradeWall title={`You've used your ${FREE_WEEKLY_SEARCHES} free searches this week`} message="Upgrade to Pro for unlimited searches and full Lead Generation." />
          ) : (
            <>
              {!pro && <div className="mb-3 text-xs text-slate-400">Free plan · {used} of {FREE_WEEKLY_SEARCHES} searches used this week</div>}
              <h2 className="mb-3 text-sm font-semibold text-slate-700">{total} {type}{q && <> matching &ldquo;{q}&rdquo;</>}</h2>
              {type === "businesses" && <DataTable<BusinessRow> rows={shownBiz} empty="No businesses match." columns={bizCols} />}
              {type === "individuals" && <DataTable<IndividualRow> rows={shownInds} empty="No individuals match." columns={indCols} />}
              {type === "funders" && <DataTable<FunderSearchRow> rows={shownFunders} empty="No funders match." columns={funderCols} />}
              {hidden > 0 && (
                <div className="mt-3"><UpgradeWall title={`${hidden} more locked`} message={`Free shows the first ${FREE_LEADGEN_ROWS}. Upgrade to Pro to see all ${total}.`} /></div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}