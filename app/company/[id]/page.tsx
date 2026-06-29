import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DataTable, Stat, Collapsible, StatusPill, TaxBadge, EntityStatusBadge, SignalCard, McaBadge, ExpiringSoonBadge, isExpiringSoon, LockedSection } from "../../components";
import { getSessionUser } from "@/lib/auth";
import { fmtDate, fmtAddress, streetKey, type AddrRow } from "@/lib/format";
import { BackButton } from "../../back-button";
import {
  businessHeadline, businessAddresses, businessFilings, businessPrincipals, businessLiens, relatedCompanies,
  businessRegistry, businessFundersList, businessTimeline,
  type BizFiling, type BizPrincipal, type LienRow, type RelatedCompany, type FunderBrief,
} from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function CompanyProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lead?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const pro = user.plan === "pro";

  const { id } = await params;
  const bizNorm = decodeURIComponent(id);
  // MCA exposure is a Pro, lead-working feature — only surfaced when the profile
  // was opened from the Lead Gen page (marked with ?lead=1).
  const fromLead = (await searchParams).lead === "1";

  const [head] = await businessHeadline(bizNorm);
  if (!head) notFound();

  const [filings, principals, liens, related, registry, funders, timeline, uccAddrs] = await Promise.all([
    businessFilings(bizNorm),
    businessPrincipals(bizNorm),
    businessLiens(bizNorm),
    relatedCompanies(bizNorm),
    businessRegistry(bizNorm),
    businessFundersList(bizNorm),
    businessTimeline(bizNorm),
    businessAddresses(bizNorm),
  ]);

  const location = [head.city, head.state].filter(Boolean).join(", ");
  const liensLabel = liens.length >= 100 ? "100+" : String(liens.length);
  const reg = registry[0];

  // Address list: UCC-filing addresses (deduped) + the Sunbiz registered address if distinct.
  const addrs: AddrRow[] = [...uccAddrs];
  if (reg?.principal_addr1) {
    const regAddr: AddrRow = { addr1: reg.principal_addr1, addr2: reg.principal_addr2, city: reg.principal_city, state: reg.principal_state, postal_code: reg.principal_postal, source: "registered" };
    if (!addrs.some((a) => streetKey(a) === streetKey(regAddr))) addrs.push(regAddr);
  }
  const address = fmtAddress(addrs[0]);
  const otherAddrs = addrs.slice(1);

  // MCA exposure — how many of this merchant's liens are from merchant-cash-advance
  // funders (vs. banks/equipment). The core "is this a stacked refi lead?" signal.
  // Pro-only, and only surfaced when opened from Lead Gen.
  const mcaFunders = new Set(filings.filter((f) => f.is_mca).map((f) => f.funder_norm)).size;
  const mcaLiens = filings.filter((f) => f.is_mca).length;
  const showMca = pro && fromLead;            // tags + exposure card
  const mcaTeaser = fromLead && !pro && mcaFunders > 0;  // Pro lock for Free users

  // At-a-glance signals (replaces the funding-by-year chart).
  const trend = fundingTrend(timeline, head.last_filing, head.ucc_count);
  const daysToRenewal = head.next_expiry ? Math.round((new Date(head.next_expiry + "T00:00:00").getTime() - Date.now()) / 86_400_000) : null;
  const suspended = !!reg && /suspend|forfeit/i.test(reg.entity_status);
  const signals: { tone: "up" | "down" | "warn" | "info" | "neutral"; label: string; detail: string }[] = [];
  if (trend) signals.push(trend);
  if (pro && daysToRenewal != null && daysToRenewal >= 0) signals.push({ tone: "info", label: "Next renewal", detail: `${fmtDate(head.next_expiry)} · in ${daysToRenewal} day${daysToRenewal === 1 ? "" : "s"}` });
  if (pro && related.length > 0) signals.push({ tone: "info", label: "Owner network", detail: `runs ${related.length} other compan${related.length === 1 ? "y" : "ies"} with UCC filings` });
  if (pro && liens.length > 0) signals.push({ tone: "warn", label: `${liensLabel} tax lien${liens.length === 1 ? "" : "s"} / judgment${liens.length === 1 ? "" : "s"}`, detail: "financial-distress signal" });
  if (suspended) signals.push({ tone: "warn", label: "Not in good standing", detail: reg!.entity_status });

  return (
    <div>
      <BackButton />

      <div className="mt-4 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-lg font-bold text-indigo-600">
          {head.biz_name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{head.biz_name}</h1>
          <p className="text-sm text-slate-500">{address || location || "—"} · Business</p>
        </div>
      </div>

      {reg && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
          <EntityStatusBadge status={reg.entity_status} />
          {reg.entity_type && <span className="text-slate-600">{reg.entity_type}</span>}
          {reg.agent && <span className="text-slate-400">· Registered agent: <span className="text-slate-600">{reg.agent}</span></span>}
        </div>
      )}

      <div className="my-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total UCC filings" value={head.ucc_count.toLocaleString()} />
        <Stat label="Active liens" value={head.active_liens.toLocaleString()} />
        <Stat label="Distinct funders" value={head.distinct_funders.toLocaleString()} />
        <Stat label="Filings · last 12 mo" value={head.ucc_12mo.toLocaleString()} />
        <Stat label="Last filing" value={fmtDate(head.last_filing)} />
        <Stat label="Tax liens / judgments" value={liensLabel} tone={liens.length > 0 ? "warn" : "default"} />
      </div>

      {/* MCA exposure — Pro, lead-working only. Banner for Pro; lock for Free. */}
      {showMca && mcaFunders > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4 text-rose-600">
            <path d="M12 2v20M5 5h11a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h11" />
          </svg>
          <span className="font-semibold text-rose-700">{mcaFunders === 1 ? "1 MCA advance on file" : `Stacked with ${mcaFunders} MCA shops`}</span>
          <span className="text-rose-600">· {mcaLiens} of {filings.length} UCC lien{filings.length === 1 ? "" : "s"} from merchant cash-advance funders</span>
        </div>
      )}
      {mcaTeaser && (
        <div className="mb-3"><LockedSection label="MCA exposure · which funders are cash-advance shops" /></div>
      )}

      {/* Signals row — at-a-glance read on the lead */}
      {signals.length > 0 && (
        <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {signals.map((sg, i) => <SignalCard key={i} tone={sg.tone} label={sg.label} detail={sg.detail} />)}
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
                  <span>
                    <Link href={`/funder/${encodeURIComponent(r.funder_norm)}`} className="font-medium text-indigo-700 hover:underline">{r.funder}</Link>
                    {showMca && r.is_mca && <McaBadge />}
                  </span>
                ) },
              { key: "liens", label: "Liens", className: "text-center nums" },
              { key: "last_filing", label: "Last filing", render: (r) => fmtDate(r.last_filing) },
            ]}
          />
        </Collapsible>
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

      {otherAddrs.length > 0 && (
        <div className="mt-7">
          <Collapsible title="Other addresses on file" count={otherAddrs.length}>
            <div className="space-y-2">
              {otherAddrs.map((a, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <div className="text-slate-700">{fmtAddress(a)}</div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {a.source === "registered"
                      ? "Registered address (Sunbiz)"
                      : `Last used ${fmtDate(a.last_filing)}${a.filings ? ` · ${a.filings} filing${a.filings === 1 ? "" : "s"}` : ""}`}
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

type Trend = { tone: "up" | "down" | "warn" | "info" | "neutral"; label: string; detail: string };
// Turn the per-year filing counts + recency into a one-line "is this lead hot?" read.
function fundingTrend(timeline: { period: string; n: number }[], lastFiling: string | null, total: number): Trend | null {
  if (!total) return null;
  const firstYear = timeline.length ? timeline[0].period : null;
  if (total === 1) return { tone: "neutral", label: "Single advance", detail: `1 advance on record${firstYear ? ` (${firstYear})` : ""}` };

  const days = lastFiling ? Math.floor((Date.now() - new Date(lastFiling + "T00:00:00").getTime()) / 86_400_000) : null;
  const recency = days != null ? `last advance ${days} day${days === 1 ? "" : "s"} ago` : "";
  if (days != null && days > 540) return { tone: "down", label: "Dormant", detail: `no new advances in ${Math.floor(days / 365)}+ years (last ${fmtDate(lastFiling)})` };

  const yrs = timeline.map((p) => ({ y: Number(p.period), n: p.n }));
  if (yrs.length <= 1) return { tone: "neutral", label: `${total} advances`, detail: `all in ${yrs[0]?.y ?? ""}${recency ? ` · ${recency}` : ""}` };

  const thisYear = new Date().getFullYear();
  const recent = yrs.filter((o) => o.y >= thisYear - 1).reduce((s, o) => s + o.n, 0);
  const earlier = yrs.filter((o) => o.y < thisYear - 1);
  const earlierAvg = earlier.length ? earlier.reduce((s, o) => s + o.n, 0) / earlier.length : 0;
  if (recent >= 2 && recent / 2 > earlierAvg * 1.5)
    return { tone: "up", label: "Accelerating", detail: `~${(recent / 2).toFixed(0)}/yr now${earlierAvg ? `, up from ~${earlierAvg.toFixed(0)}/yr before` : ""}${recency ? ` · ${recency}` : ""}` };
  if (earlierAvg > 0 && recent / 2 < earlierAvg * 0.5)
    return { tone: "down", label: "Slowing", detail: `~${(recent / 2).toFixed(0)}/yr now, down from ~${earlierAvg.toFixed(0)}/yr before${recency ? ` · ${recency}` : ""}` };
  return { tone: "neutral", label: "Steady", detail: `~${(total / yrs.length).toFixed(0)} advances/yr${recency ? ` · ${recency}` : ""}` };
}