// Shared presentational components (server-safe, no client JS needed).
import Link from "next/link";

export function NavBar() {
  const links = [
    { href: "/", label: "Dashboard" },
    { href: "/feed", label: "Competitor Feed" },
    { href: "/stacking", label: "Stacking Detector" },
    { href: "/search", label: "Owner Search" },
  ];
  return (
    <header className="border-b border-slate-200 bg-slate-900 text-white">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          UCC<span className="text-indigo-400">lookup</span>
          <span className="ml-2 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-indigo-300">
            California
          </span>
        </Link>
        <nav className="flex gap-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
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
    <form action={action} method="get" className="mb-6 flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[260px]">
        <input
          type="text"
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </div>
      {extra}
      <button
        type="submit"
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
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
    return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">{empty}</div>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            {columns.map((c) => (
              <th key={String(c.key)} className={`px-4 py-2.5 ${c.className ?? ""}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60">
              {columns.map((c) => (
                <td key={String(c.key)} className={`px-4 py-2.5 text-slate-700 ${c.className ?? ""}`}>
                  {c.render ? c.render(row) : String(row[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
