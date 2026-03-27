"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function RequestsPage() {
  const [rows, setRows] = useState<unknown[]>([]);
  const [role, setRole] = useState("");

  async function refresh() {
    const me = await fetch("/api/auth/me").then((r) => r.json());
    setRole(me.user?.role ?? "");
    const d = await fetch("/api/coverage/list").then((r) => r.json());
    setRows(d.requests ?? []);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function decide(id: string, approve: boolean) {
    await fetch(`/api/coverage/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve }),
    });
    await refresh();
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
      <Link href="/dashboard" className="text-sm text-amber-300 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-xl font-semibold">Coverage requests</h1>
      <p className="mt-1 text-sm text-zinc-500">Logged in as {role}</p>
      <ul className="mt-6 space-y-3">
        {(rows as { id: string; kind: string; status: string }[]).map((r) => (
          <li key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
            <span className="text-zinc-400">{r.kind}</span> · <span>{r.status}</span> ·{" "}
            <span className="font-mono text-xs">{r.id}</span>
            {role !== "STAFF" && r.status === "AWAITING_MANAGER" ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded bg-emerald-600 px-2 py-1 text-xs"
                  onClick={() => void decide(r.id, true)}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="rounded bg-zinc-700 px-2 py-1 text-xs"
                  onClick={() => void decide(r.id, false)}
                >
                  Deny
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
