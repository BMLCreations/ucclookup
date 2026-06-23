import Link from "next/link";
import { Stat } from "./components";
import { stats } from "@/lib/features";

export const dynamic = "force-dynamic";

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.5" fill="currentColor" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5">
      <path d="M4 20V4M4 20h16" /><rect x="7" y="12" width="3" height="5" /><rect x="12" y="8" width="3" height="9" /><rect x="17" y="14" width="3" height="3" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5">
      <circle cx="11" cy="11" r="7" /><path d="m17 17 4 4" />
    </svg>
  );
}

const features = [
  { href: "/search", title: "Find leads", desc: "Search merchants by name, funder, or filing activity — fresh, ready-to-call.", icon: <TargetIcon /> },
  { href: "/search?funders=3", title: "Stacked merchants", desc: "Businesses carrying advances from multiple different funders.", icon: <ChartIcon /> },
  { href: "/search", title: "Owner & company lookup", desc: "Drill into any business or person and their full profile.", icon: <SearchIcon /> },
];

export default async function Home() {
  const s = await stats();
  return (
    <div>
      {/* Hero */}
      <section className="relative mb-10 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-600 to-violet-600 px-8 py-10 text-white shadow-sm">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-medium tracking-wide ring-1 ring-inset ring-white/20">
            California · full UCC &amp; business-entity records
          </span>
          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            UCC lead intelligence, ready to work.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-indigo-100">
            The complete California UCC filing and business-ownership record set — turned into three
            tools that surface funded merchants, over-leveraged businesses, and the people behind them.
          </p>
        </div>
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 right-24 h-64 w-64 rounded-full bg-violet-400/20 blur-3xl" />
      </section>

      {/* Stats */}
      <div className="mb-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {s.map((row) => (
          <Stat key={row.label} label={row.label} value={Number(row.n).toLocaleString()} />
        ))}
      </div>

      {/* Feature cards */}
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">Tools</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {features.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
          >
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600 transition group-hover:bg-indigo-600 group-hover:text-white">
              {f.icon}
            </div>
            <div className="mt-4 text-base font-semibold text-slate-900">{f.title}</div>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500">{f.desc}</p>
            <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600">
              Open
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 transition group-hover:translate-x-0.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 10h10M11 6l4 4-4 4" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}