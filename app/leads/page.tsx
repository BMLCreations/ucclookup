import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Lead Generation merged into the unified Search. Preserve any filter params.
export default async function LeadsRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) p.set(k, v);
  redirect(`/search${p.toString() ? `?${p.toString()}` : ""}`);
}
