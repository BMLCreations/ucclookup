import Link from "next/link";
import { PageHeader, DataTable } from "../components";
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

const PRESETS = [
  { label: "Stacked · 3+ funders", href: "/search?funders=3" },
  { label: "Heavily stacked · 5+ funders", href: "/search?funders=5" },
  { label: "Most active · 10+ filings", href: "/search?min=10" },
];

function Field({ name, label, value, placeholder }: { name: string; label: string; value: string; placeholder: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type="text" name={name} defaultValue={value} placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
      />
    </label>
  );
}

function NumField({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input type="number" name={name} min={name === "funders" ? 0 : 1} defaultValue={value}
        className="w-32 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
    </label>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; funder?: string; person?: string; min?: string; funders?: string; win?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const funder = (sp.funder ?? "").trim();
  const person = (sp.person ?? "").trim();
  const min = Math.max(1, Number(sp.min ?? 1) || 1);
  const minFunders = Math.max(0, Number(sp.funders ?? 0) || 0);
  const win = (["all", "3mo", "6mo", "12mo"].includes(sp.win ?? "") ? sp.win : "all") as SearchWindow;

  // If an individual name is entered, search PEOPLE (filters apply to them).
  // Otherwise search BUSINESSES. One result set, never both.
  const individualMode = !!person;
  const [biz, individuals] = await Promise.all([
    individualMode ? Promise.resolve([] as BusinessRow[]) : searchBusinesses({ name: q, funder, minFilings: min, minFunders, window: win }),
    individualMode ? searchIndividuals({ name: person, minFilings: min, minFunders, window: win }) : Promise.resolve([] as IndividualRow[]),
  ]);

  const winLabel = WINDOWS.find((w) => w.v === win)?.label.toLowerCase();
  const filterNote = (
    <>
      {min > 1 && <> · <span className="text-indigo-700">{min}+</span> filings{win !== "all" && <> in the {winLabel}</>}</>}
      {minFunders > 0 && <> · <span className="text-indigo-700">{minFunders}+</span> distinct funders</>}
    </>
  );

  return (
    <div>
      <PageHeader
        title="Search"
        subtitle="Find debtors by name, creditor, or filing activity — or look up an individual. Filters combine."
      />

      <form action="/search" method="get" className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="q" label="Debtor" value={q} placeholder="e.g. Joe's Pizza" />
          <Field name="person" label="Individual" value={person} placeholder="e.g. John Smith" />
          <Field name="funder" label="Secured party / creditor" value={funder} placeholder="e.g. Forward Financing" />
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <NumField name="min" label="Min filings" value={min} />
          <NumField name="funders" label="Min funders (stacking)" value={minFunders} />
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Within</span>
            <select name="win" defaultValue={win}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100">
              {WINDOWS.map((w) => <option key={w.v} value={w.v}>{w.label}</option>)}
            </select>
          </label>
          <button type="submit" className="ml-auto rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:bg-indigo-800">
            Search
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

      {individualMode ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            {individuals.length} {individuals.length === 1 ? "individual" : "individuals"} matching &ldquo;{person}&rdquo;{filterNote}
          </h2>
          <DataTable<IndividualRow>
            rows={individuals}
            empty="No individuals match these filters."
            columns={[
              { key: "person_name", label: "Individual", className: "font-medium text-slate-900" },
              { key: "city", label: "Location", render: (r) => [r.city, r.state].filter(Boolean).join(", ") || "—" },
              { key: "ucc_count", label: "Filings", className: "text-center nums" },
              { key: "distinct_funders", label: "Funders", className: "text-center nums" },
              { key: "last_filing", label: "Last filing" },
            ]}
          />
        </section>
      ) : (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            {biz.length} {biz.length === 1 ? "business" : "businesses"}{filterNote}
            {funder && <> · funded by <span className="text-indigo-700">{funder}</span></>}
          </h2>
          <DataTable<BusinessRow>
            rows={biz}
            empty="No businesses match these filters."
            columns={[
              { key: "biz_name", label: "Business", className: "font-medium", render: (r) => (
                  <Link href={`/company/${encodeURIComponent(r.biz_norm)}`} className="font-medium text-indigo-700 hover:underline">{r.biz_name}</Link>
                ) },
              { key: "city", label: "Location", render: (r) => [r.city, r.state].filter(Boolean).join(", ") || "—" },
              { key: "ucc_count", label: "Filings", className: "text-center nums" },
              { key: "distinct_funders", label: "Funders", className: "text-center nums" },
              { key: "last_filing", label: "Last filing" },
            ]}
          />
        </section>
      )}
    </div>
  );
}