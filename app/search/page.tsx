import Link from "next/link";
import { PageHeader, DataTable } from "../components";
import {
  searchBusinesses, companiesOfPerson,
  type BusinessRow, type PersonCompanies, type SearchWindow,
} from "@/lib/features";

export const dynamic = "force-dynamic";

const WINDOWS: { v: SearchWindow; label: string }[] = [
  { v: "all", label: "All time" },
  { v: "12mo", label: "Last 12 months" },
  { v: "6mo", label: "Last 6 months" },
  { v: "3mo", label: "Last 3 months" },
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

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; funder?: string; person?: string; min?: string; win?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const funder = (sp.funder ?? "").trim();
  const person = (sp.person ?? "").trim();
  const min = Math.max(1, Number(sp.min ?? 1) || 1);
  const win = (["all", "3mo", "6mo", "12mo"].includes(sp.win ?? "") ? sp.win : "all") as SearchWindow;

  const showBiz = !!(q || funder) || min > 1 || !person;
  const [biz, people] = await Promise.all([
    showBiz ? searchBusinesses({ name: q, funder, minFilings: min, window: win }) : Promise.resolve([] as BusinessRow[]),
    person ? companiesOfPerson(person) : Promise.resolve([] as PersonCompanies[]),
  ]);

  const winLabel = WINDOWS.find((w) => w.v === win)?.label.toLowerCase();

  return (
    <div>
      <PageHeader
        title="Search"
        subtitle="Find businesses by name, funder, or filing activity — or look up a person. Filters combine."
      />

      <form action="/search" method="get" className="mb-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="q" label="Company / debtor" value={q} placeholder="e.g. Joe's Pizza" />
          <Field name="person" label="Individual" value={person} placeholder="e.g. John Smith" />
          <Field name="funder" label="Secured party (competitor)" value={funder} placeholder="e.g. Forward Financing" />
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Min UCC filings</span>
            <input type="number" name="min" min={1} defaultValue={min}
              className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
          </label>
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

      {showBiz && (
        <section className="mb-12">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            {biz.length} {biz.length === 1 ? "business" : "businesses"}
            {min > 1 && <> with <span className="text-indigo-700">{min}+</span> filings{win !== "all" && <> in the {winLabel}</>}</>}
            {funder && <> funded by <span className="text-indigo-700">{funder}</span></>}
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

      {person && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">People matching &ldquo;{person}&rdquo;</h2>
          <DataTable<PersonCompanies>
            rows={people}
            empty="No people match."
            columns={[
              { key: "last", label: "Person", className: "font-medium text-slate-900", render: (r) => `${r.first} ${r.last}` },
              { key: "city", label: "Location", render: (r) => [r.city, r.state].filter(Boolean).join(", ") || "—" },
              { key: "companies", label: "# Companies", className: "text-center nums" },
              { key: "company_list", label: "Companies", render: (r) => <span className="text-slate-500">{r.company_list}</span> },
            ]}
          />
        </section>
      )}
    </div>
  );
}