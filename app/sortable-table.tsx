"use client";
import Link from "next/link";
import { useState, useMemo } from "react";

type Kind = "business" | "individual" | "funder";
type Row = Record<string, unknown>;
type Col = {
  label: string;
  center?: boolean;
  defaultDir: "asc" | "desc";
  val: (r: Row) => string | number | null;
  render: (r: Row) => React.ReactNode;
};

const s = (v: unknown) => (v == null ? "" : String(v));
const loc = (r: Row) => [r.city, r.state].filter(Boolean).join(", ") || "—";
function taxBadge(n: number) {
  if (!n) return <span className="text-slate-300">—</span>;
  return <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">{n}</span>;
}

function colsFor(kind: Kind): Col[] {
  if (kind === "funder") {
    return [
      { label: "Funder", defaultDir: "asc", val: (r) => s(r.funder).toLowerCase(), render: (r) => <Link href={`/funder/${encodeURIComponent(s(r.funder_norm))}`} className="font-medium text-indigo-700 hover:underline">{s(r.funder)}</Link> },
      { label: "Liens filed", center: true, defaultDir: "desc", val: (r) => Number(r.filings), render: (r) => Number(r.filings).toLocaleString() },
    ];
  }
  const nameCol: Col = kind === "business"
    ? { label: "Business", defaultDir: "asc", val: (r) => s(r.biz_name).toLowerCase(), render: (r) => <Link href={`/company/${encodeURIComponent(s(r.biz_norm))}`} className="font-medium text-indigo-700 hover:underline">{s(r.biz_name)}</Link> }
    : { label: "Individual", defaultDir: "asc", val: (r) => s(r.person_name).toLowerCase(), render: (r) => <Link href={`/person/${encodeURIComponent(s(r.person_key))}`} className="font-medium text-indigo-700 hover:underline">{s(r.person_name)}</Link> };
  return [
    nameCol,
    { label: "Location", defaultDir: "asc", val: (r) => loc(r).toLowerCase(), render: (r) => loc(r) },
    { label: "Filings", center: true, defaultDir: "desc", val: (r) => Number(r.ucc_count), render: (r) => s(r.ucc_count) },
    { label: "Active", center: true, defaultDir: "desc", val: (r) => Number(r.active_liens), render: (r) => s(r.active_liens) },
    { label: "Funders", center: true, defaultDir: "desc", val: (r) => Number(r.distinct_funders), render: (r) => s(r.distinct_funders) },
    { label: "Tax liens", center: true, defaultDir: "desc", val: (r) => Number(r.tax_liens), render: (r) => taxBadge(Number(r.tax_liens)) },
    { label: "Renews", defaultDir: "asc", val: (r) => (r.next_expiry ? s(r.next_expiry) : null), render: (r) => (r.next_expiry ? s(r.next_expiry) : "—") },
    { label: "Last filing", defaultDir: "desc", val: (r) => (r.last_filing ? s(r.last_filing) : null), render: (r) => s(r.last_filing) },
  ];
}

export function SortableTable({ kind, rows, empty }: { kind: Kind; rows: Row[]; empty?: string }) {
  const cols = useMemo(() => colsFor(kind), [kind]);
  const [sortIdx, setSortIdx] = useState<number | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => {
    if (sortIdx === null) return rows;
    const col = cols[sortIdx];
    return [...rows].sort((a, b) => {
      const av = col.val(a), bv = col.val(b);
      const aNull = av === null || av === "";
      const bNull = bv === null || bv === "";
      if (aNull && bNull) return 0;
      if (aNull) return 1;   // empties always last
      if (bNull) return -1;
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortIdx, dir, cols]);

  function click(i: number) {
    if (sortIdx === i) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortIdx(i); setDir(cols[i].defaultDir); }
  }

  if (!rows.length) {
    return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">{empty ?? "No results."}</div>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {cols.map((c, i) => (
                <th key={c.label} className={`whitespace-nowrap px-4 py-3 ${c.center ? "text-center" : ""}`}>
                  <button type="button" onClick={() => click(i)} className={`inline-flex items-center gap-1 transition hover:text-slate-800 ${sortIdx === i ? "text-slate-800" : ""}`}>
                    {c.label}
                    <span className={sortIdx === i ? "text-indigo-500" : "text-slate-300"}>{sortIdx === i ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((row, ri) => (
              <tr key={ri} className="transition-colors hover:bg-indigo-50/40">
                {cols.map((c) => (
                  <td key={c.label} className={`px-4 py-3 align-top text-slate-700 ${c.center ? "text-center nums" : ""}`}>{c.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}