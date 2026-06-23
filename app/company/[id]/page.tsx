import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable, Stat, Collapsible } from "../../components";
import {
  businessHeadline, businessFilings, businessPrincipals,
  type BizFiling, type BizPrincipal,
} from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function CompanyProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bizNorm = decodeURIComponent(id);

  const [head] = await businessHeadline(bizNorm);
  if (!head) notFound();

  const [filings, principals] = await Promise.all([
    businessFilings(bizNorm),
    businessPrincipals(bizNorm),
  ]);

  const location = [head.city, head.state].filter(Boolean).join(", ");

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
              { key: "lapse", label: "Lapses" },
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
      </div>
    </div>
  );
}