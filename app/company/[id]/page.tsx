import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DataTable, Stat, Collapsible, StatusPill, TaxBadge, EntityStatusBadge, NextRenewalCallout, ExpiringSoonBadge, isExpiringSoon, LockedSection } from "../../components";
import { getSessionUser } from "@/lib/auth";
import {
  businessHeadline, businessFilings, businessPrincipals, businessLiens, relatedCompanies,
  businessRegistry, businessFundersList, businessTimeline,
  type BizFiling, type BizPrincipal, type LienRow, type RelatedCompany, type FunderBrief,
} from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function CompanyProfile({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const pro = user.plan === "pro";

  const { id } = await params;
  const bizNorm = decodeURIComponent(id);

  const [head] = await businessHeadline(bizNorm);
  if (!head) notFound();

  const [filings, principals, liens, related, registry, funders, timeline] = await Promise.all([
    businessFilings(bizNorm),
    businessPrincipals(bizNorm),
    businessLiens(bizNorm),
    relatedCompanies(bizNorm),
    businessRegistry(bizNorm),
    businessFundersList(bizNorm),
    businessTimeline(bizNorm),
  ]);

  const location = [head.city, head.state].filter(Boolean).join(", ");
  const liensLabel = liens.length >= 100 ? "100+" : String(liens.length);
  const reg = registry[0];
  const maxYear = Math.max(1, ...timeline.map((p) => p.n));

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

      {reg && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
          <EntityStatusBadge status={reg.entity_status} />
          {reg.entity_type && <span className="text-slate-600">{reg.entity_type}</span>}
          {reg.agent && <span className="text-slate-400">· Registered agent: <span className="text-slate-600">{reg.agent}</span></span>}
        </div>
      )}

      {pro && <NextRenewalCallout date={head.next_expiry} />}

      <div className="my-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total UCC filings" value={head.ucc_count.toLocaleString()} />
        <Stat label="Distinct funders" value={head.distinct_funders.toLocaleString()} />
        <Stat label="Filings · last 6 mo" value={head.ucc_6mo.toLocaleString()} />
        <Stat label="Last filing" value={head.last_filing ?? "—"} />
        <Stat label="Tax liens / judgments" value={liensLabel} tone={liens.length > 0 ? "warn" : "default"} />
      </div>

      {timeline.length >= 2 && (
        <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-700">Funding activity by year</div>
          <div className="flex h-24 items-end gap-1.5">
            {timeline.map((p) => (
              <div key={p.period} className="flex flex-1 flex-col items-center gap-1" title={`${p.n} filing${p.n === 1 ? "" : "s"} in ${p.period}`}>
                <div className="w-full rounded-t bg-indigo-500/80" style={{ height: `${Math.max(4, Math.round((p.n / maxYear) * 80))}px` }} />
                <span className="text-[10px] text-slate-400">{p.period.slice(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Collapsible
          title={<>Funders <span className="font-normal text-slate-400">· who has financed this business</span></>}
          count={funders.length}
        >
          <DataTable<FunderBrief>
            rows={funders}
            empty="No funders on record."
            columns={[
              { key: "funder", label: "Funder", className: "font-medium", render: (r) => (
                  <Link href={`/funder/${encodeURIComponent(r.funder_norm)}`} className="font-medium text-indigo-700 hover:underline">{r.funder}</Link>
                ) },
              { key: "liens", label: "Liens", className: "text-center nums" },
              { key: "last_filing", label: "Last filing" },
            ]}
          />
        </Collapsible>
        <Collapsible title="UCC filing history" count={filings.length}>
          <DataTable<BizFiling>
            rows={filings}
            empty="No UCC filings."
            columns={[
              { key: "filed", label: "Filed" },
              { key: "funder", label: "Secured party", render: (r) => (
                  <div>
                    {r.funder
                      ? <Link href={`/funder/${encodeURIComponent(r.funder_norm)}`} className="font-medium text-indigo-700 hover:underline">{r.funder}</Link>
                      : <span className="font-medium text-slate-900">—</span>}
                    {r.funder_loc && <div className="text-xs text-slate-400">{r.funder_loc}</div>}
                  </div>
                ) },
              { key: "status", label: "Status", className: "text-center", render: (r) => <StatusPill status={r.status} /> },
              { key: "lapse", label: "Lapse / Expiration date", render: (r) => (
                  <span>{r.lapse || "—"}{isExpiringSoon(r.status, r.lapse) && <ExpiringSoonBadge />}</span>
                ) },
              { key: "debtor_addr", label: "Debtor address", render: (r) => <span className="text-slate-500">{r.debtor_addr || "—"}</span> },
              { key: "filing_num", label: "Filing #", render: (r) => <span className="text-xs text-slate-400">{r.filing_num}</span> },
            ]}
          />
        </Collapsible>

        {pro ? (
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
        ) : (
          <LockedSection label="Tax liens & judgments" />
        )}

        <Collapsible
          title={<>People on this business <span className="font-normal text-slate-400">· from the CA business registry</span></>}
          count={principals.length}
        >
          <DataTable<BizPrincipal>
            rows={principals}
            empty="No matching registry record (this business may file under a different legal name)."
            columns={[
              { key: "name", label: "Person", className: "font-medium", render: (r) => r.has_profile
                  ? <Link href={`/person/${encodeURIComponent(r.person_key)}`} className="font-medium text-indigo-700 hover:underline">{r.name}</Link>
                  : <span className="font-medium text-slate-900">{r.name}</span> },
              { key: "role", label: "Role" },
              { key: "entity_name", label: "Registered entity", render: (r) => <span className="text-slate-500">{r.entity_name}</span> },
            ]}
          />
        </Collapsible>

        {pro ? (
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
        ) : (
          <LockedSection label="Related companies (owner network)" />
        )}
      </div>
    </div>
  );
}