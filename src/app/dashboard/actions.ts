"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie } from "@/lib/auth/session";

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
