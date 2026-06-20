import Link from "next/link";
import { PageHeader, Stat } from "./components";
import { stats } from "@/lib/features";

export const dynamic = "force-dynamic";

const features = [
  { href: "/feed", title: "Competitor Feed", desc: "Fresh merchants just funded by your competitors — ready-to-call leads.", emoji: "🎯" },
  { href: "/stacking", title: "Stacking Detector", desc: "Businesses carrying multiple active advances from different funders.", emoji: "📊" },
  { href: "/search", title: "Owner Search", desc: "Find a company's owner, then every other company they run.", emoji: "🔎" },
];

export default async function Home() {
  const s = await stats();
  return (
    <div>
      <PageHeader
        title="California UCC Lead Intelligence"
        subtitle="Loaded from California's official bulk data. Three tools, one dataset."
      />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {s.map((row) => (
          <Stat key={row.label} label={row.label} value={Number(row.n).toLocaleString()} />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {features.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
          >
            <div className="text-2xl">{f.emoji}</div>
            <div className="mt-3 font-semibold text-slate-900 group-hover:text-indigo-700">{f.title}</div>
            <p className="mt-1 text-sm text-slate-500">{f.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
