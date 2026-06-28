// Display a YYYY-MM-DD (or ISO) date string as MM/DD/YYYY. Passthrough if it
// doesn't look like a date; "—" for empty. Safe in both server and client code.
export function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : s;
}

// Format a public-record street address (from a UCC filing) as a one-line string,
// title-cased so the all-caps source data reads cleanly. "" if no street address.
export type Addr = { addr1?: string | null; addr2?: string | null; city?: string | null; state?: string | null; postal_code?: string | null };
export type AddrRow = Addr & { last_filing?: string | null; filings?: number; source?: string };
export function fmtAddress(a: Addr | null | undefined): string {
  if (!a || !a.addr1) return "";
  const tc = (s: string) => s.replace(/\b([A-Za-z])([A-Za-z]*)\b/g, (_, h, t) => h.toUpperCase() + t.toLowerCase());
  const street = tc([a.addr1, a.addr2].filter(Boolean).join(" ").trim());
  const cityTc = a.city ? tc(a.city) : "";
  const tail = [a.state ? a.state.toUpperCase() : "", a.postal_code || ""].filter(Boolean).join(" ");
  return [street, cityTc, tail].filter(Boolean).join(", ");
}

// Coarse key for an address, aggressive on purpose because the source data spells
// the same place many ways. Strips the unit/suite, then the street-type suffix
// (Rd/Road, Dr/Drive, Ln/Lane…), then collapses to alphanumerics — so "6404 Rambler
// Rd", "6404 Rambler Drive", "2611 Belt Line Rd Ste 200", "...Road #200" all reduce
// to the street number+name. Keyed on street+state (city dropped) so city typos
// (Sunnyvale/Sunnyvle) don't split the same place into separate rows.
const UNIT = /\b(STE|SUITE|UNIT|APT|RM|ROOM|BLDG|NO|DEPT)\b.*$/;
const STREET_TYPE = /\b(ROAD|RD|DRIVE|DR|LANE|LN|STREET|STR|ST|AVENUE|AVE|AV|BOULEVARD|BLVD|COURT|CT|PLACE|PL|CIRCLE|CIR|TERRACE|TER|TRAIL|TRL|PARKWAY|PKWY|HIGHWAY|HWY|WAY|PIKE|LOOP|PATH|RUN|ROW|SQUARE|SQ|PLAZA|EXPRESSWAY|EXPY)\b[.\s]*$/;
export function streetKey(a: Addr): string {
  const st = (a.addr1 || "").toUpperCase()
    .replace(UNIT, "").replace(/#.*$/, "")
    .replace(STREET_TYPE, "")
    .replace(/[^A-Z0-9]/g, "");
  return st + "|" + (a.state || "").toUpperCase();
}
// Merge address rows that are the same place spelled differently: sum the filing
// counts, keep the most-recently-seen spelling, sort newest-first.
export function dedupeAddresses(rows: AddrRow[]): AddrRow[] {
  const map = new Map<string, AddrRow>();
  for (const r of rows) {
    if (!r.addr1) continue;
    const k = streetKey(r);
    const ex = map.get(k);
    if (!ex) { map.set(k, { ...r }); continue; }
    const total = (ex.filings || 0) + (r.filings || 0);
    if ((r.last_filing || "") > (ex.last_filing || "")) Object.assign(ex, r);
    ex.filings = total;
  }
  return [...map.values()].sort((a, b) => (b.last_filing || "").localeCompare(a.last_filing || ""));
}