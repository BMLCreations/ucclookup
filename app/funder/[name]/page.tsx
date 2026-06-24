import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable, Stat } from "../../components";
import { funderHeadline, funderMerchants, type FunderMerchant } from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function FunderProfile({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const funderNorm = decodeURIComponent(name);

  const [head] = await funderHeadline(funderNorm);
  if (!head || head.total === 0) notFound();

  const merchants = await funderMerchants(funderNorm);

  return (
    <div>
      <Link href="/search" className="text-sm font-medium text-slate-500 transition hover:text-slate-800">
        ← Back to search
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-lg font-bold text-emerald-600">
          {(head.funder_name || "?").slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{head.funder_name}</h1>
          <p className="text-sm text-slate-500">Secured party / funder · California</p>
        </div>
      </div>

      <div className="my-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total liens filed" value={head.total.toLocaleString()} />
        <Stat label="Merchants funded" value={head.merchants.toLocaleString()} />
        <Stat label="Last filing" value={head.last_filing ?? "—"} />
      </div>

      <h2 className="mb-3 text-sm font-semibold text-slate-700">
        Merchants funded <span className="font-normal text-slate-400">· this funder&apos;s book</span>
      </h2>
      <DataTable<FunderMerchant>
        rows={merchants}
        empty="No merchants on record."
        columns={[
          { key: "merchant", label: "Merchant", className: "font-medium", render: (r) => (
              <Link href={`/company/${encodeURIComponent(r.biz_norm)}`} className="font-medium text-indigo-700 hover:underline">{r.merchant}</Link>
            ) },
          { key: "city", label: "Location", render: (r) => [r.city, r.state].filter(Boolean).join(", ") || "—" },
          { key: "liens", label: "Liens", className: "text-center nums" },
          { key: "last_filing", label: "Last filing" },
        ]}
      />
    </div>
  );
}
