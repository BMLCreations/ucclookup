// Display a YYYY-MM-DD (or ISO) date string as MM/DD/YYYY. Passthrough if it
// doesn't look like a date; "—" for empty. Safe in both server and client code.
export function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : s;
}