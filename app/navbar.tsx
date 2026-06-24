"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/auth-actions";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/search", label: "UCC Search" },
  { href: "/leads", label: "Lead Gen" },
];

export function NavBar({ user }: { user: { email: string; plan: string } | null }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm">U</span>
          <span className="text-[15px] font-semibold tracking-tight text-slate-900">
            UCC<span className="text-indigo-600">lookup</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm sm:flex">
          {links.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2.5 text-sm">
          {user ? (
            <>
              <span className={`hidden rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset sm:inline ${
                user.plan === "pro"
                  ? "bg-indigo-50 text-indigo-700 ring-indigo-600/20"
                  : "bg-slate-100 text-slate-500 ring-slate-400/20"
              }`}>
                {user.plan === "pro" ? "Pro" : "Free"}
              </span>
              <span className="hidden max-w-[160px] truncate text-slate-500 sm:inline">{user.email}</span>
              <form action={logoutAction}>
                <button type="submit" className="rounded-lg px-3 py-1.5 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-3 py-1.5 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
                Log in
              </Link>
              <Link href="/signup" className="rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white shadow-sm transition hover:bg-indigo-700">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
