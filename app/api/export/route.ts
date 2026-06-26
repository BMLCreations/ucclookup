import { getSessionUser } from "@/lib/auth";
import { exportBusinesses, exportIndividuals, type SearchWindow } from "@/lib/features";
import { exportUsed, addExport, EXPORT_MONTHLY_CAP } from "@/lib/usage";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// CSV-escape a single field.
function f(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Please log in.", { status: 401 });
  if (user.plan !== "pro") return new Response("CSV export is a Pro feature.", { status: 403 });

  const used = await exportUsed(user.id);
  const remaining = EXPORT_MONTHLY_CAP - used;
  if (remaining <= 0) {
    return new Response(`Monthly export limit reached (${EXPORT_MONTHLY_CAP.toLocaleString()} rows). Resets at the start of next month.`, { status: 429 });
  }

  const sp = new URL(request.url).searchParams;
  const type = sp.get("type") === "individuals" ? "individuals" : "businesses";
  const opts = {
    minFilings: Number(sp.get("min")) || 1,
    minFunders: Number(sp.get("funders")) || 0,
    window: (["all", "3mo", "6mo", "12mo"].includes(sp.get("win") ?? "") ? sp.get("win") : "all") as SearchWindow,
    state: (sp.get("state") ?? "").trim(),
    city: (sp.get("city") ?? "").trim(),
    renewingDays: [30, 60, 90].includes(Number(sp.get("renew"))) ? Number(sp.get("renew")) : 0,
  };

  const nameHeader = type === "businesses" ? "Business" : "Individual";
  const headers = [nameHeader, "City", "State", "Total Filings", "Active Liens", "Distinct Funders", "Tax Liens", "Next Renewal", "Last Filing"];
  let lines: string[];

  if (type === "businesses") {
    const rows = await exportBusinesses({ ...opts, funder: (sp.get("fundedby") ?? "").trim() }, remaining);
    lines = rows.map((r) => [r.biz_name, r.city, r.state, r.ucc_count, r.active_liens, r.distinct_funders, r.tax_liens, fmtDate(r.next_expiry), fmtDate(r.last_filing)].map(f).join(","));
    await addExport(user.id, rows.length);
  } else {
    const rows = await exportIndividuals(opts, remaining);
    lines = rows.map((r) => [r.person_name, r.city, r.state, r.ucc_count, r.active_liens, r.distinct_funders, r.tax_liens, fmtDate(r.next_expiry), fmtDate(r.last_filing)].map(f).join(","));
    await addExport(user.id, rows.length);
  }

  const csv = "﻿" + [headers.map(f).join(","), ...lines].join("\r\n"); // BOM for Excel
  const fname = `ucclookup-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control": "no-store",
    },
  });
}
