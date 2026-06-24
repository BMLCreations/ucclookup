"use server";
import { redirect } from "next/navigation";

// Placeholder until Stripe is wired in the next step. Keeps the Pro button
// functional (shows a "coming soon" note) instead of dead-ending.
export async function startCheckout() {
  redirect("/pricing?soon=1");
}
