import Link from "next/link";
import { PageHeader, DataTable, TaxBadge, UpgradeWall, LoginGate } from "../components";
import { getSessionUser } from "@/lib/auth";
import { consumeSearch, FREE_DAILY_SEARCHES } from "@/lib/usage";
import {
  searchBusinesses, searchIndividuals,
  type BusinessRow, type IndividualRow,
} from "@/lib/features";

export const dynamic = "force-dynamic";

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
  searchParams: Promise<{ q?: string; funder?: string; person?: string }>;
}) {
  const user = await getSessionUser();
  const loggedOut = !user;
  const pro = user?.plan === "pro";

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const funder = (sp.funder ?? "").trim();
  const person = (sp.person ?? "").trim();
  const didSearch = !!(q || funder || person);

  // Free plan: each name lookup counts against the daily quota (logged-in only).
  let overQuota = false;
  let used = 0;
  if (user && !pro && didSearch) {
    const quota = await consumeSearch(user.id);
    overQuota = !quota.allowed;
    used = quota.used;
  }

  // Only run queries for logged-in users within quota.
  const individualMode = !!person;
  const canSearch = !!user && !overQuota;
  const [biz, individuals] = await Promise.all([
    canSearch && !individualMode ? searchBusinesses({ name: q, funder }) : Promise.resolve([] as BusinessRow[]),
    canSearch && individualMode ? searchIndividuals({ name: person }) : Promise.resolve([] as IndividualRow[]),
  ]);

  return (
    <div>
      <PageHeader
        title="UCC Search"
        subtitle="Look up a debtor, individual, or secured party by name — then open their full profile."
      />

      <form action="/search" method="get" className="mb-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="q" label="Debtor" value={q} placeholder="e.g. Joe's Pizza" />
          <Field name="person" label="Individual" value={person} placeholder="e.g. John Smith" />
          <Field name="funder" label="Secured party / creditor" value={funder} placeholder="e.g. Forward Financing" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          {!pro && didSearch && !overQuota && (
            <span className="text-xs text-slate-400">Free plan · {used} of {FREE_DAILY_SEARCHES} daily searches used</span>
          )}
          <button type="submit" className="ml-auto rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:bg-indigo-800">
            Search
          </button>
        </div>
      </form>

      {loggedOut ? (
        <LoginGate />
      ) : overQuota ? (
        <UpgradeWall
          title={`You've used your ${FREE_DAILY_SEARCHES} free searches today`}
          message="Upgrade to Pro for unlimited searches, full Lead Generation, and complete profiles."
        />
      ) : individualMode ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            {individuals.length} {individuals.length === 1 ? "individual" : "individuals"} matching &ldquo;{person}&rdquo;
          </h2>
          <DataTable<IndividualRow>
            rows={individuals}
            empty="No individuals match that name."
            columns={[
              { key: "person_name", label: "Individual", className: "font-medium", render: (r) => (
                  <Link href={`/person/${encodeURIComponent(r.person_key)}`} className="font-medium text-indigo-700 hover:underline">{r.person_name}</Link>
                ) },
              { key: "city", label: "Location", render: (r) => [r.city, r.state].filter(Boolean).join(", ") || "—" },
              { key: "ucc_count", label: "Filings", className: "text-center nums" },
              { key: "active_liens", label: "Active", className: "text-center nums" },
              { key: "distinct_funders", label: "Funders", className: "text-center nums" },
              { key: "tax_liens", label: "Tax liens", className: "text-center", render: (r) => <TaxBadge n={r.tax_liens} /> },
              { key: "last_filing", label: "Last filing" },
            ]}
          />
        </section>
      ) : (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            {biz.length} {biz.length === 1 ? "business" : "businesses"}
            {q && <> matching &ldquo;{q}&rdquo;</>}
            {funder && <> · funded by <span className="text-indigo-700">{funder}</span></>}
          </h2>
          <DataTable<BusinessRow>
            rows={biz}
            empty="No businesses match that name."
            columns={[
              { key: "biz_name", label: "Business", className: "font-medium", render: (r) => (
                  <Link href={`/company/${encodeURIComponent(r.biz_norm)}`} className="font-medium text-indigo-700 hover:underline">{r.biz_name}</Link>
                ) },
              { key: "city", label: "Location", render: (r) => [r.city, r.state].filter(Boolean).join(", ") || "—" },
              { key: "ucc_count", label: "Filings", className: "text-center nums" },
              { key: "active_liens", label: "Active", className: "text-center nums" },
              { key: "distinct_funders", label: "Funders", className: "text-center nums" },
              { key: "tax_liens", label: "Tax liens", className: "text-center", render: (r) => <TaxBadge n={r.tax_liens} /> },
              { key: "last_filing", label: "Last filing" },
            ]}
          />
        </section>
      )}
    </div>
  );
}