import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { FairnessDashboard } from "./FairnessDashboard";

export default async function FairnessPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-4 py-4">
        <Link href="/dashboard" className="text-sm text-amber-300 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Fairness & overtime</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Premium spread vs desired hours, and projected OT for the payroll week.
        </p>
      </header>
      <FairnessDashboard />
    </div>
  );
}
