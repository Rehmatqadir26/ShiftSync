"use client";

import { DateTime } from "luxon";
import { useCallback, useEffect, useState } from "react";

type ReqRow = {
  id: string;
  kind: string;
  status: string;
  fromUser: { id: string; name: string };
  toUser: { id: string; name: string } | null;
  assignment: {
    shift: {
      location: { name: string; code: string; timezone: string };
      requiredSkill: { name: string };
      startUtc: string;
      endUtc: string;
    };
  };
};

function formatShiftRange(row: ReqRow): string {
  const z = row.assignment.shift.location.timezone;
  const s = DateTime.fromISO(row.assignment.shift.startUtc, { zone: "utc" }).setZone(z);
  const e = DateTime.fromISO(row.assignment.shift.endUtc, { zone: "utc" }).setZone(z);
  return `${s.toFormat("ccc LLL d, h:mm a")} – ${e.toFormat("h:mm a")}`;
}

const STATUS_STYLE: Record<string, string> = {
  AWAITING_PEER: "bg-sky-950/50 text-sky-300 border-sky-800",
  AWAITING_MANAGER: "bg-amber-950/50 text-amber-200 border-amber-800",
  APPROVED: "bg-emerald-950/50 text-emerald-300 border-emerald-800",
  REJECTED: "bg-zinc-800 text-zinc-400 border-zinc-700",
  CANCELLED: "bg-zinc-800 text-zinc-500 border-zinc-700",
  EXPIRED: "bg-zinc-800 text-zinc-500 border-zinc-700",
};

export function RequestsClient() {
  const [rows, setRows] = useState<ReqRow[]>([]);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const me = await fetch("/api/auth/me").then((r) => r.json());
    setRole(me.user?.role ?? "");
    const d = await fetch("/api/coverage/list").then((r) => r.json());
    setLoading(false);
    setRows((d.requests ?? []) as ReqRow[]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data) as { type?: string };
        if (m.type === "coverage_update" || m.type === "schedule_updated") void refresh();
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [refresh]);

  async function decide(id: string, approve: boolean) {
    setActing(id);
    setMsg(null);
    const res = await fetch(`/api/coverage/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve }),
    });
    const data = await res.json().catch(() => ({}));
    setActing(null);
    if (!res.ok) {
      setMsg(typeof data.error === "string" ? data.error : "Action failed");
      return;
    }
    await refresh();
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {msg ? <p className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">{msg}</p> : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/20 px-6 py-12 text-center">
          <p className="text-zinc-400">No coverage requests</p>
          <p className="mt-2 text-sm text-zinc-600">
            Swap and drop requests you create or receive will show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => {
            const st = STATUS_STYLE[r.status] ?? "bg-zinc-900/60 text-zinc-300 border-zinc-700";
            return (
              <li
                key={r.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs font-medium text-zinc-300">
                        {r.kind === "SWAP" ? "Swap" : "Drop"}
                      </span>
                      <span className={`rounded-md border px-2 py-0.5 text-xs ${st}`}>{r.status.replace(/_/g, " ")}</span>
                    </div>
                    <p className="mt-2 font-medium text-zinc-100">{r.assignment.shift.location.name}</p>
                    <p className="text-xs text-zinc-500">
                      {r.assignment.shift.location.code} · {r.assignment.shift.requiredSkill.name}
                    </p>
                    <p className="mt-2 text-zinc-400">{formatShiftRange(r)}</p>
                    <p className="mt-3 text-xs text-zinc-500">
                      From <span className="text-zinc-300">{r.fromUser.name}</span>
                      {r.toUser ? (
                        <>
                          {" "}
                          → <span className="text-zinc-300">{r.toUser.name}</span>
                        </>
                      ) : (
                        <span className="text-zinc-600"> · Awaiting peer</span>
                      )}
                    </p>
                  </div>
                  {role !== "STAFF" && r.status === "AWAITING_MANAGER" ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={acting === r.id}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                        onClick={() => void decide(r.id, true)}
                      >
                        {acting === r.id ? "…" : "Approve"}
                      </button>
                      <button
                        type="button"
                        disabled={acting === r.id}
                        className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                        onClick={() => void decide(r.id, false)}
                      >
                        Deny
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
