import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable, Stat, Collapsible, StatusPill, TaxBadge } from "../../components";
import {
  businessHeadline, businessFilings, businessPrincipals, businessLiens, relatedCompanies,
  type BizFiling, type BizPrincipal, type LienRow, type RelatedCompany,
} from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function CompanyProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bizNorm = decodeURIComponent(id);

  const [head] = await businessHeadline(bizNorm);
  if (!head) notFound();

  const [filings, principals, liens, related] = await Promise.all([
    businessFilings(bizNorm),
    businessPrincipals(bizNorm),
    businessLiens(bizNorm),
    relatedCompanies(bizNorm),
  ]);

  const location = [head.city, head.state].filter(Boolean).join(", ");
  const liensLabel = liens.length >= 100 ? "100+" : String(liens.length);

  return (
    <div>
      <Link href="/search" className="text-sm font-medium text-slate-500 transition hover:text-slate-800">
        ← Back to search
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-lg font-bold text-indigo-600">
          {head.biz_name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{head.biz_name}</h1>
          <p className="text-sm text-slate-500">{location || "California"} · Business</p>
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
          title={<>People on this business <span className="font-normal text-slate-400">· from the CA business registry</span></>}
          count={principals.length}
        >
          <DataTable<BizPrincipal>
            rows={principals}
            empty="No matching registry record (this business may file under a different legal name)."
            columns={[
              { key: "name", label: "Person", className: "font-medium text-slate-900" },
              { key: "role", label: "Role" },
              { key: "entity_name", label: "Registered entity", render: (r) => <span className="text-slate-500">{r.entity_name}</span> },
            ]}
          />
        </Collapsible>

        <Collapsible
          title={<>Related companies <span className="font-normal text-slate-400">· share an owner &amp; have UCC filings</span></>}
          count={related.length}
        >
          <DataTable<RelatedCompany>
            rows={related}
            empty="No related companies with UCC filings found."
            columns={[
              { key: "biz_name", label: "Company", className: "font-medium", render: (r) => (
                  <Link href={`/company/${encodeURIComponent(r.biz_norm)}`} className="font-medium text-indigo-700 hover:underline">{r.biz_name}</Link>
                ) },
              { key: "via", label: "Connected via", render: (r) => <span className="text-slate-500">{r.via}</span> },
              { key: "ucc_count", label: "Filings", className: "text-center nums" },
              { key: "active_liens", label: "Active", className: "text-center nums" },
              { key: "tax_liens", label: "Tax liens", className: "text-center", render: (r) => <TaxBadge n={r.tax_liens} /> },
            ]}
          />
        </Collapsible>
      </div>
    </div>
  );
}