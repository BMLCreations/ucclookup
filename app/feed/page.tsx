import Link from "next/link";
import { PageHeader, SearchForm, DataTable } from "../components";
import { competitorFeed, topFunders, type Lead } from "@/lib/features";

export const dynamic = "force-dynamic";

const DEFAULT_COMPETITORS = "GoodLeap; Snap-on Credit; Kubota Credit";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; own?: string }>;
}) {
  const sp = await searchParams;
  const raw = sp.c ?? DEFAULT_COMPETITORS;
  const own = sp.own ?? "";
  const competitors = raw.split(";").map((s) => s.trim()).filter(Boolean);

  const [leads, funders] = await Promise.all([
    competitors.length ? competitorFeed(competitors, own || "—none—") : Promise.resolve([] as Lead[]),
    topFunders(24),
  ]);

  return (
    <div>
      <PageHeader
        title="Competitor Feed"
        subtitle="Merchants recently funded by the competitors you name — minus your own deals. Each row is a lead."
      />

      <SearchForm
        action="/feed"
        name="c"
        label="Find leads"
        placeholder="Competitor funders, separated by ;"
        defaultValue={raw}
        extra={
          <input
            type="text"
            name="own"
            defaultValue={own}
            placeholder="Your own company (to exclude)"
            className="min-w-[220px] rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        }
      />

      <p className="mb-4 text-sm text-slate-600">
        Watching <span className="font-medium text-slate-900">{competitors.join(", ") || "no funders"}</span> —{" "}
        <span className="font-semibold text-indigo-700">{leads.length}</span> fresh leads.
      </p>

      <DataTable<Lead>
        rows={leads}
        empty="No leads for those funders in the sample week. Try a name from the funder list below."
        columns={[
          { key: "filed", label: "Filed" },
          { key: "merchant_name", label: "Merchant (lead)", className: "font-medium text-slate-900" },
          { key: "funded_by", label: "Funded by" },
          { key: "city", label: "City" },
          { key: "state", label: "St" },
          { key: "postal_code", label: "ZIP" },
        ]}
      />

      <div className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Top funders in the data — click to target one:</h2>
        <div className="flex flex-wrap gap-2">
          {funders.map((f) => (
            <Link
              key={f.funder}
              href={`/feed?c=${encodeURIComponent(f.funder)}`}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-sm hover:border-indigo-300 hover:text-indigo-700"
            >
              {f.funder} <span className="text-slate-400">· {f.filings}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
