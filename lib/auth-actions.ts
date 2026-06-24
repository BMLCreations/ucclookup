"use server";
import { redirect } from "next/navigation";
import {
  hashPassword, verifyPassword, createUser, getUserByEmail,
  setSessionCookie, clearSessionCookie,
} from "./auth";

const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const err = (path: string, msg: string) => redirect(`${path}?error=${encodeURIComponent(msg)}`);

export async function signupAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
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
