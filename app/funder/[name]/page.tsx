import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DataTable, Stat, UpgradeWall } from "../../components";
import { getSessionUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { BackButton } from "../../back-button";
import { funderHeadline, funderMerchants, type FunderMerchant } from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function FunderProfile({ params }: { params: Promise<{ name: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const pro = user.plan === "pro";

  const { name } = await params;
  const funderNorm = decodeURIComponent(name);

  const [head] = await funderHeadline(funderNorm);
  if (!head || head.total === 0) notFound();

  const merchants = pro ? await funderMerchants(funderNorm) : [];

  return (
    <div>
      <BackButton />

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
        <Stat label="Last filing" value={fmtDate(head.last_filing)} />
      </div>

      <h2 className="mb-3 text-sm font-semibold text-slate-700">
        Merchants funded <span className="font-normal text-slate-400">· this funder&apos;s book</span>
      </h2>
      {pro ? (
        <DataTable<FunderMerchant>
          rows={merchants}
          empty="No merchants on record."
          columns={[
            { key: "merchant", label: "Merchant", className: "font-medium", render: (r) => (
                <Link href={`/company/${encodeURIComponent(r.biz_norm)}`} className="font-medium text-indigo-700 hover:underline">{r.merchant}</Link>
              ) },
            { key: "city", label: "Location", render: (r) => [r.city, r.state].filter(Boolean).join(", ") || "—" },
            { key: "liens", label: "Liens", className: "text-center nums" },
            { key: "last_filing", label: "Last filing", render: (r) => fmtDate(r.last_filing) },
          ]}
        />
      ) : (
        <UpgradeWall
          title={`See every merchant ${head.funder_name} has funded`}
          message="Funder books — a competitor's full portfolio — are a Pro feature. Upgrade to unlock."
        />
      )}
    </div>
  );
}
