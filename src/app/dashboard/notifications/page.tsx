import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { NotificationsClient } from "./NotificationsClient";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-4 py-4">
        <Link href="/dashboard" className="text-sm text-amber-300 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Notifications</h1>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <NotificationsClient />
      </div>
    </div>
  );
}
