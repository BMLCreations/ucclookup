// Shared presentational components (server-safe, no client JS needed).

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
      <span className="text-amber-700">{date} · in {days} day{days === 1 ? "" : "s"}</span>
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