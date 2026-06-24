import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { startCheckout } from "@/lib/billing-actions";
import { FREE_DAILY_SEARCHES } from "@/lib/usage";

export const dynamic = "force-dynamic";

const FREE = [
  "UCC Search — look up any business or person",
  `${FREE_DAILY_SEARCHES} searches per day`,
  "View profiles (basic details)",
  "Lead Generation — preview of 8 results per search",
];
const PRO = [
  "Everything in Free, unlimited",
  "Unlimited searches",
  "Full Lead Generation — all results + CSV export",
  "Full profiles — owner network, renewals, tax liens",
  "Funder books — every merchant a funder has financed",
];

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ soon?: string }> }) {
  const user = await getSessionUser();
  const pro = user?.plan === "pro";
  const { soon } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl py-6">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900">Plans</h1>
      <p className="mt-1 text-center text-sm text-slate-500">Start free. Upgrade when you&apos;re ready to work real volume.</p>

      {soon && (
        <div className="mx-auto mt-5 max-w-md rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-700 ring-1 ring-inset ring-amber-600/20">
          Card checkout is being set up — hang tight, it&apos;ll be live shortly.
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {/* Free */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-slate-500">Free</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">$0</div>
          <ul className="mt-5 space-y-2.5 text-sm text-slate-600">
            {FREE.map((f) => <li key={f} className="flex gap-2"><Check /> {f}</li>)}
          </ul>
          <div className="mt-6">
            {user ? (
              <span className="inline-flex w-full justify-center rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-500">
                {pro ? "Included in Pro" : "Your current plan"}
              </span>
            ) : (
              <Link href="/signup" className="inline-flex w-full justify-center rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Get started free
              </Link>
            )}
          </div>
        </div>

        {/* Pro */}
        <div className="rounded-2xl border-2 border-indigo-300 bg-white p-6 shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-indigo-600">Pro</span>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/20">Most popular</span>
          </div>
          <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">$299<span className="text-base font-normal text-slate-400">/mo</span></div>
          <ul className="mt-5 space-y-2.5 text-sm text-slate-600">
            {PRO.map((f) => <li key={f} className="flex gap-2"><Check /> {f}</li>)}
          </ul>
          <div className="mt-6">
            {pro ? (
              <span className="inline-flex w-full justify-center rounded-xl bg-indigo-600/10 px-5 py-2.5 text-sm font-semibold text-indigo-700">
                You&apos;re on Pro ✓
              </span>
            ) : user ? (
              <form action={startCheckout}>
                <button type="submit" className="inline-flex w-full justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">
                  Subscribe to Pro
                </button>
              </form>
            ) : (
              <Link href="/signup" className="inline-flex w-full justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">
                Sign up to subscribe
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500">
      <path d="M4 10l4 4 8-9" />
    </svg>
  );
}
