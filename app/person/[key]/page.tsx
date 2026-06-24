import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable, Stat, Collapsible, StatusPill } from "../../components";
import {
  personHeadline, personFilings, personCompanies, personLiens,
  type BizFiling, type PersonCompany, type LienRow,
} from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function PersonProfile({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const personKey = decodeURIComponent(key);

  const [head] = await personHeadline(personKey);
  if (!head) notFound();

  const [filings, companies, liens] = await Promise.all([
    personFilings(personKey),
    personCompanies(personKey),
    personLiens(personKey),
  ]);

  const location = [head.city, head.state].filter(Boolean).join(", ");
  const liensLabel = liens.length >= 100 ? "100+" : String(liens.length);

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

      <div className="my-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total UCC filings" value={head.ucc_count.toLocaleString()} />
        <Stat label="Distinct funders" value={head.distinct_funders.toLocaleString()} />
        <Stat label="Filings · last 6 mo" value={head.ucc_6mo.toLocaleString()} />
        <Stat label="Last filing" value={head.last_filing ?? "—"} />
        <Stat label="Tax liens / judgments" value={liensLabel} tone={liens.length > 0 ? "warn" : "default"} />
      </div>

      <div className="space-y-3">
        <Collapsible title="UCC filing history" count={filings.length}>
          <DataTable<BizFiling>
            rows={filings}
            empty="No UCC filings."
            columns={[
              { key: "filed", label: "Filed" },
              { key: "funder", label: "Secured party", render: (r) => (
                  <div>
                    <div className="font-medium text-slate-900">{r.funder || "—"}</div>
                    {r.funder_loc && <div className="text-xs text-slate-400">{r.funder_loc}</div>}
                  </div>
                ) },
              { key: "status", label: "Status", className: "text-center", render: (r) => <StatusPill status={r.status} /> },
              { key: "lapse", label: "Lapse / Expiration date" },
              { key: "debtor_addr", label: "Debtor address", render: (r) => <span className="text-slate-500">{r.debtor_addr || "—"}</span> },
              { key: "filing_num", label: "Filing #", render: (r) => <span className="text-xs text-slate-400">{r.filing_num}</span> },
            ]}
          />
        </Collapsible>

        <Collapsible
          title={<>Tax liens &amp; judgments <span className="font-normal text-slate-400">· state, federal &amp; court</span></>}
          count={liens.length}
        >
          <DataTable<LienRow>
            rows={liens}
            empty="No tax liens or judgments on record."
            columns={[
              { key: "filed", label: "Filed" },
              { key: "lien_type", label: "Type", className: "font-medium text-slate-900" },
              { key: "claimant", label: "Claimant", render: (r) => r.claimant || "—" },
              { key: "status", label: "Status", className: "text-center", render: (r) => <StatusPill status={r.status} /> },
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