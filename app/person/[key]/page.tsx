import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DataTable, Stat, Collapsible, StatusPill, NextRenewalCallout, McaBadge, ExpiringSoonBadge, isExpiringSoon, LockedSection } from "../../components";
import { getSessionUser } from "@/lib/auth";
import { fmtDate, fmtAddress } from "@/lib/format";
import { BackButton } from "../../back-button";
import {
  personHeadline, personAddresses, personFilings, personCompanies, personLiens, personCoOwners,
  type BizFiling, type PersonCompany, type LienRow, type CoOwner,
} from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function PersonProfile({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ lead?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const pro = user.plan === "pro";

  const { key } = await params;
  const personKey = decodeURIComponent(key);
  // MCA exposure: Pro-only, surfaced only when opened from Lead Gen (?lead=1).
  const fromLead = (await searchParams).lead === "1";

  const [head] = await personHeadline(personKey);
  if (!head) notFound();

  const [filings, companies, liens, coOwners, uccAddrs] = await Promise.all([
    personFilings(personKey),
    personCompanies(personKey),
    personLiens(personKey),
    personCoOwners(personKey),
    personAddresses(personKey),
  ]);

  const location = [head.city, head.state].filter(Boolean).join(", ");
  const address = fmtAddress(uccAddrs[0]);
  const otherAddrs = uccAddrs.slice(1);
  const liensLabel = liens.length >= 100 ? "100+" : String(liens.length);

  // MCA exposure across this person's UCC liens (advances vs. bank/equipment).
  const mcaFunders = new Set(filings.filter((f) => f.is_mca).map((f) => f.funder_norm)).size;
  const mcaLiens = filings.filter((f) => f.is_mca).length;
  const showMca = pro && fromLead;
  const mcaTeaser = fromLead && !pro && mcaFunders > 0;

  return (
    <div>
      <BackButton />

      <div className="mt-4 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-50 text-lg font-bold text-violet-600">
          {head.person_name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{head.person_name}</h1>
          <p className="text-sm text-slate-500">{address || location || "—"} · Individual</p>
        </div>
      </div>

      {pro && <NextRenewalCallout date={head.next_expiry} />}

      {showMca && mcaFunders > 0 && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4 text-rose-600">
            <path d="M12 2v20M5 5h11a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h11" />
          </svg>
          <span className="font-semibold text-rose-700">{mcaFunders === 1 ? "1 MCA advance on file" : `Stacked with ${mcaFunders} MCA shops`}</span>
          <span className="text-rose-700">· {mcaLiens} of {filings.length} lien{filings.length === 1 ? "" : "s"} from cash-advance funders</span>
        </div>
      )}
      {mcaTeaser && (
        <div className="mt-3 max-w-md"><LockedSection label="MCA exposure · which funders are cash-advance shops" /></div>
      )}

      <div className="my-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total UCC filings" value={head.ucc_count.toLocaleString()} />
        <Stat label="Distinct funders" value={head.distinct_funders.toLocaleString()} />
        <Stat label="Filings · last 6 mo" value={head.ucc_6mo.toLocaleString()} />
        <Stat label="Last filing" value={fmtDate(head.last_filing)} />
        <Stat label="Tax liens / judgments" value={liensLabel} tone={liens.length > 0 ? "warn" : "default"} />
      </div>

      <div className="space-y-3">
        <Collapsible title="UCC filing history" count={filings.length}>
          <DataTable<BizFiling>
            rows={filings}
            empty="No UCC filings."
            columns={[
              { key: "filed", label: "Filed", render: (r) => fmtDate(r.filed) },
              { key: "funder", label: "Secured party", render: (r) => (
                  <div>
                    {r.funder
                      ? <span><Link href={`/funder/${encodeURIComponent(r.funder_norm)}`} className="font-medium text-indigo-700 hover:underline">{r.funder}</Link>{showMca && r.is_mca && <McaBadge />}</span>
                      : <span className="font-medium text-slate-900">—</span>}
                    {r.funder_loc && <div className="text-xs text-slate-400">{r.funder_loc}</div>}
                  </div>
                ) },
              { key: "status", label: "Status", className: "text-center", render: (r) => <StatusPill status={r.status} /> },
              { key: "lapse", label: "Lapse / Expiration date", render: (r) => (
                  <span>{fmtDate(r.lapse)}{isExpiringSoon(r.status, r.lapse) && <ExpiringSoonBadge />}</span>
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
                { key: "filed", label: "Filed", render: (r) => fmtDate(r.filed) },
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

        {pro ? (
          <Collapsible
            title={<>Co-owners <span className="font-normal text-slate-400">· people who share a company with this person</span></>}
            count={coOwners.length}
          >
            <DataTable<CoOwner>
              rows={coOwners}
              empty="No co-owners found."
              columns={[
                { key: "name", label: "Person", className: "font-medium", render: (r) => r.has_profile
                    ? <Link href={`/person/${encodeURIComponent(r.person_key)}`} className="font-medium text-indigo-700 hover:underline">{r.name}</Link>
                    : <span className="font-medium text-slate-900">{r.name}</span> },
                { key: "city", label: "Location", render: (r) => [r.city, r.state].filter(Boolean).join(", ") || "—" },
                { key: "shared", label: "Shared companies", className: "text-center nums" },
              ]}
            />
          </Collapsible>
        ) : (
          <LockedSection label="Co-owners (people network)" />
        )}
      </div>

      {otherAddrs.length > 0 && (
        <div className="mt-7">
          <Collapsible title="Other addresses on file" count={otherAddrs.length}>
            <div className="space-y-2">
              {otherAddrs.map((a, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <div className="text-slate-700">{fmtAddress(a)}</div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    Last used {fmtDate(a.last_filing)}{a.filings ? ` · ${a.filings} filing${a.filings === 1 ? "" : "s"}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </Collapsible>
        </div>
      )}
    </div>
  );
}