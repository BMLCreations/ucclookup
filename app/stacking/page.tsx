import { PageHeader, DataTable } from "../components";
import { stackingDetector, type StackedMerchant } from "@/lib/features";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function StackingPage({
  searchParams,
}: {
  searchParams: Promise<{ min?: string }>;
}) {
  const sp = await searchParams;
  const min = Math.max(2, Number(sp.min ?? 2) || 2);
  const rows = await stackingDetector(min);

  const options = [2, 3, 4];

  return (
    <div>
      <PageHeader
        title="Stacking Detector"
        subtitle="Businesses with multiple ACTIVE liens from DIFFERENT funders. Junk filings, banks, card networks, processors and trusts are filtered out."
      />

      <div className="mb-6 flex items-center gap-2 text-sm">
        <span className="text-slate-600">Minimum different funders:</span>
        {options.map((n) => (
          <Link
            key={n}
            href={`/stacking?min=${n}`}
            className={`rounded-lg px-3 py-1.5 font-medium ${
              n === min ? "bg-indigo-600 text-white" : "border border-slate-300 bg-white text-slate-700 hover:border-indigo-300"
            }`}
          >
            {n}+
          </Link>
        ))}
      </div>

      <p className="mb-4 text-sm text-slate-600">
        <span className="font-semibold text-indigo-700">{rows.length}</span> stacked merchants with {min}+ active funders.
      </p>

      <DataTable<StackedMerchant>
        rows={rows}
        empty="No merchants hit this threshold. Try lowering the minimum number of funders."
        columns={[
          { key: "merchant", label: "Merchant", className: "font-medium text-slate-900" },
          { key: "distinct_funders", label: "Funders", className: "text-center" },
          { key: "active_liens", label: "Active liens", className: "text-center" },
          {
            key: "funders",
            label: "Who funded them",
            render: (r) => <span className="text-slate-500">{r.funders}</span>,
          },
        ]}
      />

      <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-700">How this works:</span> a lien counts as active when it
        isn&apos;t terminated or lapsed. We count distinct funders per merchant and exclude banks, card
        networks, payment processors, trusts, and known junk filers — so what&apos;s left is real
        over-leveraged businesses.
      </p>
    </div>
  );
}
