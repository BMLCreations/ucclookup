// Shared presentational components (server-safe, no client JS needed).
import { fmtDate } from "@/lib/format";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-slate-900">{title}</h1>
      {subtitle && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-500">{subtitle}</p>}
    </div>
  );
}

export function SearchForm({
  action,
  name,
  placeholder,
  defaultValue,
  label = "Search",
  extra,
}: {
  action: string;
  name: string;
  placeholder: string;
  defaultValue?: string;
  label?: string;
  extra?: React.ReactNode;
}) {
  return (
    <form action={action} method="get" className="mb-6 flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-[280px] flex-1">
        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="9" cy="9" r="6" /><path d="m14 14 3 3" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
        />
      </div>
      {extra}
      <button
        type="submit"
        className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:bg-indigo-800"
      >
        {label}
      </button>
    </form>
  );
}

type Col<T> = { key: keyof T; label: string; className?: string; render?: (row: T) => React.ReactNode };

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  empty = "No results.",
}: {
  columns: Col<T>[];
  rows: T[];
  empty?: string;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        {empty}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {columns.map((c) => (
                <th key={String(c.key)} className={`whitespace-nowrap px-4 py-3 ${c.className ?? ""}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, i) => (
              <tr key={i} className="transition-colors hover:bg-indigo-50/40">
                {columns.map((c) => (
                  <td key={String(c.key)} className={`px-4 py-3 align-top text-slate-700 ${c.className ?? ""}`}>
                    {c.render ? c.render(row) : String(row[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Collapsible section — native <details>, no client JS. Collapsed by default;
// the summary row is the clickable header (chevron rotates, View/Hide toggles).
export function Collapsible({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="group" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-90">
          <path d="M7 5l6 5-6 5" />
        </svg>
        <span>{title}</span>
        {count != null && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{count}</span>
        )}
        <span className="ml-auto text-xs font-normal text-slate-400 group-open:hidden">View</span>
        <span className="ml-auto hidden text-xs font-normal text-slate-400 group-open:inline">Hide</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export function Stat({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "warn" }) {
  const warn = tone === "warn";
  return (
    <div className={`rounded-xl border p-5 shadow-sm transition ${warn ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
      <div className={`nums text-[26px] font-semibold leading-none tracking-tight ${warn ? "text-amber-700" : "text-slate-900"}`}>{value}</div>
      <div className={`mt-2 text-[11px] font-semibold uppercase tracking-wider ${warn ? "text-amber-600" : "text-slate-400"}`}>{label}</div>
    </div>
  );
}

// Tax-lien/judgment count badge for list rows — amber when present, em-dash when none.
export function TaxBadge({ n }: { n: number }) {
  if (!n) return <span className="text-slate-300">—</span>;
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
      {n}
    </span>
  );
}

// Full-width upgrade wall — shown in place of locked content (e.g. when a Free
// user is over their daily search limit, or for the rest of a Lead Gen result set).
export function UpgradeWall({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-8 text-center shadow-sm">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-indigo-100 text-indigo-600">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </div>
      <h3 className="mt-3 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{message}</p>
      <a href="/pricing" className="mt-4 inline-flex rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">
        Upgrade to Pro
      </a>
    </div>
  );
}

// Logged-out teaser: blurred placeholder rows behind a "log in to search" card.
// Uses fake names only (no real data is sent to the browser).
export function LoginGate() {
  const fake = [
    "Sierra Freight LLC", "Golden State Foods Inc", "Pacific Auto Group", "Valley Logistics Co",
    "Harbor Bakery LLC", "Summit Capital Partners", "Redwood Holdings", "Coastal Services Inc",
  ];
  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none select-none blur-[5px]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Business</th><th className="px-4 py-3">Location</th>
                <th className="px-4 py-3 text-center">Filings</th><th className="px-4 py-3 text-center">Funders</th>
                <th className="px-4 py-3">Last filing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fake.map((n, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-medium text-indigo-700">{n}</td>
                  <td className="px-4 py-3 text-slate-700">Los Angeles, CA</td>
                  <td className="px-4 py-3 text-center nums">{9 - i}</td>
                  <td className="px-4 py-3 text-center nums">{5 - (i % 4)}</td>
                  <td className="px-4 py-3 text-slate-700">2026-0{(i % 9) + 1}-1{i % 9}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="absolute inset-0 grid place-items-center px-4">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white/95 p-6 text-center shadow-lg backdrop-blur-sm">
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-indigo-100 text-indigo-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>
          <h3 className="mt-3 text-base font-semibold text-slate-900">Log in to search</h3>
          <p className="mx-auto mt-1 text-sm text-slate-500">Create a free account to look up businesses, owners, and funders across California.</p>
          <div className="mt-4 flex justify-center gap-2">
            <a href="/signup" className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">Sign up free</a>
            <a href="/login" className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Log in</a>
          </div>
        </div>
      </div>
    </div>
  );
}

// A locked stand-in for a premium profile section (Free users see the lock,
// not the data — so they know there's more behind the Pro wall).
export function LockedSection({ label }: { label: string }) {
  return (
    <a href="/pricing" className="flex items-center gap-2 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-3 text-sm transition hover:border-indigo-300 hover:bg-indigo-50">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-indigo-500">
        <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      <span className="font-semibold text-slate-700">{label}</span>
      <span className="ml-auto text-xs font-medium text-indigo-600">Upgrade to Pro →</span>
    </a>
  );
}

// A lien is "expiring soon" if it's still Active and lapses within ~90 days.
export function isExpiringSoon(status: string, lapse: string): boolean {
  if (status !== "Active" || !lapse) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = (new Date(lapse + "T00:00:00").getTime() - today.getTime()) / 86_400_000;
  return days >= 0 && days <= 90;
}

export function ExpiringSoonBadge() {
  return (
    <span className="ml-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
      Expiring soon
    </span>
  );
}

// Headline callout: when does this entity's soonest still-live advance mature?
export function NextRenewalCallout({ date }: { date: string | null }) {
  if (!date) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(date + "T00:00:00").getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return null;
  return (
    <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4 text-amber-600">
        <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
      </svg>
      <span className="font-semibold text-amber-700">Next renewal</span>
      <span className="text-amber-700">{fmtDate(date)} · in {days} day{days === 1 ? "" : "s"}</span>
    </div>
  );
}

// A compact at-a-glance signal card for the profile signals row.
export function SignalCard({ tone, label, detail }: { tone: "up" | "down" | "warn" | "info" | "neutral"; label: string; detail: string }) {
  const bg: Record<string, string> = {
    up: "border-emerald-200 bg-emerald-50", down: "border-slate-200 bg-slate-50",
    warn: "border-amber-200 bg-amber-50", info: "border-indigo-200 bg-indigo-50", neutral: "border-slate-200 bg-white",
  };
  const fg: Record<string, string> = {
    up: "text-emerald-700", down: "text-slate-600", warn: "text-amber-700", info: "text-indigo-700", neutral: "text-slate-700",
  };
  return (
    <div className={`rounded-xl border p-3.5 shadow-sm ${bg[tone]}`}>
      <div className={`text-sm font-semibold ${fg[tone]}`}>{label}</div>
      <div className="mt-0.5 text-xs leading-relaxed text-slate-500">{detail}</div>
    </div>
  );
}

// CA business-registry status — Active (green), Suspended/Forfeited (red),
// everything else terminated/inactive/merged (slate).
export function EntityStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const tone = s.includes("active")
    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
    : s.includes("suspend") || s.includes("forfeit")
      ? "bg-red-50 text-red-700 ring-red-600/20"
      : "bg-slate-100 text-slate-500 ring-slate-400/20";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>{status}</span>;
}

// Lien status pill — Active (green) / Lapsed (slate) / Terminated (slate, muted).
export function StatusPill({ status }: { status: string }) {
  const tones: Record<string, string> = {
    Active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    Lapsed: "bg-slate-100 text-slate-600 ring-slate-500/20",
    Terminated: "bg-slate-100 text-slate-400 ring-slate-400/20",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[status] ?? tones.Lapsed}`}>
      {status}
    </span>
  );
}