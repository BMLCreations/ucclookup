import Link from "next/link";
import { Stat } from "./components";
import { stats } from "@/lib/features";
import { getSessionUser } from "@/lib/auth";
import { FREE_WEEKLY_SEARCHES } from "@/lib/usage";

export const dynamic = "force-dynamic";

function Icon({ d, fill }: { d: string; fill?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      {d.split("|").map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

const BENEFITS = [
  { t: "Fresh funded merchants", d: "Every business that just took a UCC filing — the merchants actively raising money right now, ready to pitch.", p: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16|M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8" },
  { t: "Stacking detector", d: "Instantly spot over-leveraged merchants carrying advances from 3, 5, even 10 different funders.", p: "M4 20V4|M4 20h16|M8 17v-4|M13 17v-7|M18 17v-2" },
  { t: "Renewal radar", d: "Catch merchants whose advance is about to mature — the exact moment they go shopping for new money.", p: "M12 7v5l3 2|M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18" },
  { t: "Owner & company network", d: "Trace the operator behind a business to every other company they run — and all of their filings.", p: "M7 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4|M17 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4|M12 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4|M8 6h8|M8 7l3 9|M16 7l-3 9" },
  { t: "Funder books", d: "Open any funder and see their entire portfolio — every merchant a competitor has financed.", p: "M5 5v14a2 2 0 0 0 2 2h12V3H7a2 2 0 0 0-2 2z|M9 7h7|M9 11h7" },
  { t: "Distress signals", d: "Tax liens, judgments, suspended entities — know a merchant's risk before you ever pick up the phone.", p: "M12 9v4|M12 17h.01|M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" },
];

export default async function Home() {
  const [s, user] = await Promise.all([stats(), getSessionUser()]);
  const pro = user?.plan === "pro";

  const primary = !user
    ? { href: "/signup", label: "Start free" }
    : { href: "/leads", label: "Open Lead Generation" };
  const secondary = !user
    ? { href: "/pricing", label: "See pricing" }
    : pro
      ? { href: "/search", label: "UCC Search" }
      : { href: "/pricing", label: "Upgrade to Pro" };

  return (
    <div>
      {/* Hero */}
      <section className="relative mb-10 overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-indigo-600 to-violet-600 px-8 py-14 text-white shadow-sm sm:px-12">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-medium tracking-wide ring-1 ring-inset ring-white/20">
            California · complete UCC &amp; business-entity records
          </span>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Find the businesses taking money — before your competition.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-indigo-100">
            Every California merchant that&apos;s filed a UCC, with the intelligence that turns a name into a deal:
            who&apos;s stacked, who&apos;s renewing, who&apos;s behind the business, and which competitor funded them.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={primary.href} className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50">
              {primary.label}
            </Link>
            <Link href={secondary.href} className="rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20">
              {secondary.label}
            </Link>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 right-24 h-72 w-72 rounded-full bg-violet-400/20 blur-3xl" />
      </section>

      {/* Stats — proof of scale */}
      <div className="mb-14">
        <p className="mb-4 text-center text-sm font-medium text-slate-500">The complete California record set — already loaded and searchable.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {s.map((row) => (
            <Stat key={row.label} label={row.label} value={Number(row.n).toLocaleString()} />
          ))}
        </div>
      </div>

      {/* Benefits */}
      <div className="mb-14">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-slate-900">Everything you need to find and qualify merchants</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm leading-relaxed text-slate-500">
          Anyone can buy a UCC list. UCClookup turns those filings into intelligence — so you spend your time on the merchants worth calling.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.t} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                <Icon d={b.p} />
              </div>
              <div className="mt-4 text-base font-semibold text-slate-900">{b.t}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{b.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Two products */}
      <div className="mb-14 grid gap-4 sm:grid-cols-2">
        <Link href="/search" className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Product 1</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">UCC Search</div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">Already have a name? Look up any debtor, owner, or funder and open their full profile — filings, funders, status, and network.</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600">Look someone up →</span>
        </Link>
        <Link href="/leads" className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Product 2</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">Lead Generation</div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">Don&apos;t know who yet? Filter the whole state by activity, stacking, renewal timing, and location to build a ready-to-call list.</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600">Generate leads →</span>
        </Link>
      </div>

      {/* Pricing CTA */}
      {!pro && (
        <section className="overflow-hidden rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-8 text-center shadow-sm sm:p-12">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Start free. Go Pro when you&apos;re ready to work real volume.</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
            Free gives you UCC Search and {FREE_WEEKLY_SEARCHES} searches a week. Pro unlocks unlimited search, full lead lists with export,
            renewal radar, owner networks, funder books, and distress signals — everything that finds you deals.
          </p>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">$299<span className="text-base font-normal text-slate-400">/mo for Pro</span></div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href={user ? "/pricing" : "/signup"} className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">
              {user ? "Upgrade to Pro" : "Start free"}
            </Link>
            <Link href="/pricing" className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white">
              Compare plans
            </Link>
          </div>
          <p className="mt-3 text-xs text-slate-400">One extra closed deal pays for the year.</p>
        </section>
      )}
    </div>
  );
}
