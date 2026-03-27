import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-amber-400/90">ShiftSync</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Shift scheduling</h1>
        <p className="mt-2 max-w-md text-sm text-zinc-400">
          Coastal Eats demo: four sites, two time zones, fewer coverage surprises.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/login"
          className="rounded-xl bg-amber-500 px-6 py-3 text-sm font-medium text-zinc-950 hover:bg-amber-400"
        >
          Sign in
        </Link>
        <Link
          href="/dashboard"
          className="rounded-xl border border-zinc-600 px-6 py-3 text-sm text-zinc-200 hover:bg-zinc-900"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
