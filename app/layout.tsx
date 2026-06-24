import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NavBar } from "./navbar";
import { getSessionUser } from "@/lib/auth";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "UCClookup — California UCC lead intelligence",
  description: "Search UCC filings and business ownership across California.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-900 antialiased">
        <NavBar user={user ? { email: user.email, plan: user.plan } : null} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>© 2026 UCClookup · California UCC &amp; business-entity intelligence</span>
            <span>Source: California Secretary of State public records</span>
          </div>
        </footer>
      </body>
    </html>
  );
}