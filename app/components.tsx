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

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300">
      <div className="nums text-[26px] font-semibold leading-none tracking-tight text-slate-900">{value}</div>
      <div className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
    </div>
  );
}