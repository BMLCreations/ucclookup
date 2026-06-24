"use client";
import { useRouter } from "next/navigation";

// Returns to the previous page (Lead Gen or UCC Search, wherever you came from),
// instead of a hardcoded link. Falls back to UCC Search if there's no history.
export function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => { if (window.history.length > 1) router.back(); else router.push("/search"); }}
      className="text-sm font-medium text-slate-500 transition hover:text-slate-800"
    >
      ← Back
    </button>
  );
}
