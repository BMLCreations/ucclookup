"use server";
import { redirect } from "next/navigation";
import {
  hashPassword, verifyPassword, createUser, getUserByEmail,
  setSessionCookie, clearSessionCookie,
} from "./auth";
import { rateLimit, clientIp } from "./ratelimit";

const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const err = (path: string, msg: string) => redirect(`${path}?error=${encodeURIComponent(msg)}`);
const TOO_MANY = "Too many attempts. Please wait a few minutes and try again.";

export async function signupAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  // Max 5 signups per IP per hour.
  if (!(await rateLimit(`signup:${await clientIp()}`, 5, 3600))) err("/signup", TOO_MANY);
  if (!validEmail(email)) err("/signup", "Enter a valid email address.");
  if (password.length < 8) err("/signup", "Password must be at least 8 characters.");
  if (await getUserByEmail(email)) err("/signup", "An account with that email already exists.");

  const user = await createUser(email, await hashPassword(password));
  await setSessionCookie(user.id);
  redirect("/");
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  // Throttle by IP (20/10min) and by email (10/10min) to slow brute-forcing.
  const ipOk = await rateLimit(`login-ip:${await clientIp()}`, 20, 600);
  const emailOk = await rateLimit(`login-email:${email}`, 10, 600);
  if (!ipOk || !emailOk) err("/login", TOO_MANY);

  const user = await getUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    err("/login", "Invalid email or password.");
    return;
  }
  await setSessionCookie(user.id);
  redirect("/");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
