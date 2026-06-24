import Link from "next/link";
import { redirect } from "next/navigation";
import { signupAction } from "@/lib/auth-actions";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSessionUser()) redirect("/");
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Create your account</h1>
      <p className="mt-1 text-sm text-slate-500">Free plan includes UCC Search. Upgrade to Pro for Lead Generation.</p>

      <form action={signupAction} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-600/20">{error}</div>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</span>
          <input type="email" name="email" required autoComplete="email"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</span>
          <input type="password" name="password" required minLength={8} autoComplete="new-password"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
          <span className="mt-1 block text-xs text-slate-400">At least 8 characters.</span>
        </label>
        <button type="submit" className="w-full rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:bg-indigo-800">
          Create account
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-500">
        Already have an account? <Link href="/login" className="font-medium text-indigo-700 hover:underline">Log in</Link>
      </p>
    </div>
  );
}
