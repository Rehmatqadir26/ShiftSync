import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ProfileClient } from "./ProfileClient";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "STAFF") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-4 py-4">
        <Link href="/dashboard" className="text-sm text-amber-300 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-xl font-semibold">My profile</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Desired hours, pay rate for OT estimates, timezone, and recurring availability.
        </p>
      </header>
      <ProfileClient />
    </div>
  );
}
