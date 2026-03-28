import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AuditLogClient } from "./AuditLogClient";

export default async function AuditPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-4 py-4">
        <Link href="/dashboard" className="text-sm text-amber-300 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Audit log</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Immutable history of shift and assignment changes (admin only).
        </p>
      </header>
      <AuditLogClient />
    </div>
  );
}
