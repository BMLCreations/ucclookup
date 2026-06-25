import Link from "next/link";
import { TaxBadge } from "./components";
import type { BusinessRow, IndividualRow, FunderSearchRow } from "@/lib/features";

// Shared result-table columns used by both UCC Search and Lead Generation.
export const bizCols = [
  { key: "biz_name" as const, label: "Business", className: "font-medium", render: (r: BusinessRow) => <Link href={`/company/${encodeURIComponent(r.biz_norm)}`} className="font-medium text-indigo-700 hover:underline">{r.biz_name}</Link> },
  { key: "city" as const, label: "Location", render: (r: BusinessRow) => [r.city, r.state].filter(Boolean).join(", ") || "—" },
  { key: "ucc_count" as const, label: "Filings", className: "text-center nums" },
  { key: "active_liens" as const, label: "Active", className: "text-center nums" },
  { key: "distinct_funders" as const, label: "Funders", className: "text-center nums" },
  { key: "tax_liens" as const, label: "Tax liens", className: "text-center", render: (r: BusinessRow) => <TaxBadge n={r.tax_liens} /> },
  { key: "next_expiry" as const, label: "Renews", render: (r: BusinessRow) => r.next_expiry ?? "—" },
  { key: "last_filing" as const, label: "Last filing" },
];
export const indCols = [
  { key: "person_name" as const, label: "Individual", className: "font-medium", render: (r: IndividualRow) => <Link href={`/person/${encodeURIComponent(r.person_key)}`} className="font-medium text-indigo-700 hover:underline">{r.person_name}</Link> },
  { key: "city" as const, label: "Location", render: (r: IndividualRow) => [r.city, r.state].filter(Boolean).join(", ") || "—" },
  { key: "ucc_count" as const, label: "Filings", className: "text-center nums" },
  { key: "active_liens" as const, label: "Active", className: "text-center nums" },
  { key: "distinct_funders" as const, label: "Funders", className: "text-center nums" },
  { key: "tax_liens" as const, label: "Tax liens", className: "text-center", render: (r: IndividualRow) => <TaxBadge n={r.tax_liens} /> },
  { key: "next_expiry" as const, label: "Renews", render: (r: IndividualRow) => r.next_expiry ?? "—" },
  { key: "last_filing" as const, label: "Last filing" },
];
export const funderCols = [
  { key: "funder" as const, label: "Funder", className: "font-medium", render: (r: FunderSearchRow) => <Link href={`/funder/${encodeURIComponent(r.funder_norm)}`} className="font-medium text-indigo-700 hover:underline">{r.funder}</Link> },
  { key: "filings" as const, label: "Liens filed", className: "text-center nums", render: (r: FunderSearchRow) => Number(r.filings).toLocaleString() },
];