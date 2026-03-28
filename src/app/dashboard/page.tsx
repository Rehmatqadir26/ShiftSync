import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { logoutAction } from "./actions";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-400/90">ShiftSync</p>
            <h1 className="text-lg font-semibold">Hi, {session.name}</h1>
            <p className="text-xs text-zinc-500">
              {session.role.toLowerCase()} · {session.email}
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-3 text-sm">
            <Link className="rounded-lg px-3 py-1.5 text-zinc-300 hover:bg-zinc-800" href="/dashboard">
              Home
            </Link>
            <Link className="rounded-lg px-3 py-1.5 text-zinc-300 hover:bg-zinc-800" href="/dashboard/schedule">
              Schedule
            </Link>
            <Link className="rounded-lg px-3 py-1.5 text-zinc-300 hover:bg-zinc-800" href="/dashboard/fairness">
              Fairness
            </Link>
            <Link className="rounded-lg px-3 py-1.5 text-zinc-300 hover:bg-zinc-800" href="/dashboard/requests">
              Requests
            </Link>
            <Link className="rounded-lg px-3 py-1.5 text-zinc-300 hover:bg-zinc-800" href="/dashboard/live">
              On duty
            </Link>
            {session.role === "STAFF" ? (
              <Link className="rounded-lg px-3 py-1.5 text-zinc-300 hover:bg-zinc-800" href="/dashboard/profile">
                Profile
              </Link>
            ) : null}
            <Link className="rounded-lg px-3 py-1.5 text-zinc-300 hover:bg-zinc-800" href="/dashboard/notifications">
              Notifications
            </Link>
            {session.role === "ADMIN" ? (
              <Link className="rounded-lg px-3 py-1.5 text-zinc-300 hover:bg-zinc-800" href="/dashboard/audit">
                Audit
              </Link>
            ) : null}
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg border border-zinc-600 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800"
              >
                Log out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
        <p className="text-zinc-400">
          Use <strong className="font-medium text-zinc-300">Schedule</strong> for assignments (with optional dry-run
          check), <strong className="font-medium text-zinc-300">Fairness</strong> for labor analytics,{" "}
          <strong className="font-medium text-zinc-300">Requests</strong> for swaps/drops, and{" "}
          <strong className="font-medium text-zinc-300">On duty</strong> for live clock-ins. Staff can edit{" "}
          <strong className="font-medium text-zinc-300">Profile</strong> availability and preferences.
        </p>
      </main>
    </div>
  );
}
