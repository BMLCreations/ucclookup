import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable, Stat, Collapsible } from "../../components";
import {
  personHeadline, personFilings, personCompanies,
  type BizFiling, type PersonCompany,
} from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function PersonProfile({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const personKey = decodeURIComponent(key);

  const [head] = await personHeadline(personKey);
  if (!head) notFound();

  const [filings, companies] = await Promise.all([
    personFilings(personKey),
    personCompanies(personKey),
  ]);

  const location = [head.city, head.state].filter(Boolean).join(", ");

  return (
    <div>
      <Link href="/search" className="text-sm font-medium text-slate-500 transition hover:text-slate-800">
        ← Back to search
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-50 text-lg font-bold text-violet-600">
          {head.person_name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{head.person_name}</h1>
          <p className="text-sm text-slate-500">{location || "California"} · Individual</p>
        </div>
      </div>

      <div className="my-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total UCC filings" value={head.ucc_count.toLocaleString()} />
        <Stat label="Distinct funders" value={head.distinct_funders.toLocaleString()} />
        <Stat label="Filings · last 6 mo" value={head.ucc_6mo.toLocaleString()} />
        <Stat label="Last filing" value={head.last_filing ?? "—"} />
      </div>

      <div className="space-y-3">
        <Collapsible title="UCC filing history" count={filings.length}>
          <DataTable<BizFiling>
            rows={filings}
            empty="No UCC filings."
            columns={[
              { key: "filed", label: "Filed" },
              { key: "action", label: "Type" },
              { key: "funder", label: "Funded by", className: "font-medium text-slate-900" },
              { key: "lapse", label: "Lapse / Expiration date" },
            ]}
          />
        </Collapsible>

        <Collapsible
          title={<>Companies linked to this person <span className="font-normal text-slate-400">· by name{location && " + city"}</span></>}
          count={companies.length}
        >
          <DataTable<PersonCompany>
            rows={companies}
            empty="No matching registry companies."
            columns={[
              { key: "entity_name", label: "Company", className: "font-medium", render: (r) => (
                  <Link href={`/company/${encodeURIComponent(r.biz_norm)}`} className="font-medium text-indigo-700 hover:underline">{r.entity_name}</Link>
                ) },
              { key: "entity_type", label: "Type", render: (r) => <span className="text-slate-500">{r.entity_type || "—"}</span> },
              { key: "role", label: "Role" },
              { key: "city", label: "Location", render: (r) => [r.city, r.state].filter(Boolean).join(", ") || "—" },
            ]}
          />
        </Collapsible>
      </div>
    </div>
  );
}