// Authentication: bcrypt password hashing + a signed (jose) session cookie.
// The cookie carries only the user id; the plan is always read fresh from the DB
// so a Stripe upgrade/downgrade takes effect immediately. Server-only.
import "server-only";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { q } from "./db";

const COOKIE = "ucc_session";

function secretKey() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export type AppUser = { id: number; email: string; plan: string; stripe_customer_id: string | null };

export function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createUser(email: string, passwordHash: string): Promise<AppUser> {
  const rows = await q<AppUser>(
    `INSERT INTO app_users (email, password_hash) VALUES ($1, $2)
     RETURNING id, email, plan, stripe_customer_id`,
    [email, passwordHash],
  );
  return rows[0];
}
export async function getUserByEmail(email: string) {
  const rows = await q<AppUser & { password_hash: string }>(
    `SELECT id, email, plan, stripe_customer_id, password_hash FROM app_users WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}
export async function getUserById(id: number): Promise<AppUser | null> {
  const rows = await q<AppUser>(
    `SELECT id, email, plan, stripe_customer_id FROM app_users WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function setSessionCookie(userId: number) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

// The current logged-in user (with a fresh plan from the DB), or null.
export async function getSessionUser(): Promise<AppUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const uid = Number(payload.uid);
    if (!uid) return null;
    return await getUserById(uid);
  } catch {
    return null;
  }
}

export function isPro(user: AppUser | null): boolean {
  return user?.plan === "pro";
}
