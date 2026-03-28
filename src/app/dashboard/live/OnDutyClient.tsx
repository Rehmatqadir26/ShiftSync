"use client";

import { DateTime } from "luxon";
import { useCallback, useEffect, useMemo, useState } from "react";

type Loc = { id: string; name: string; code: string; timezone: string };

type OnDutyRow = {
  id: string;
  user: { id: string; name: string };
  location: Loc;
  clockInUtc: string;
  shiftStart: string;
  shiftEnd: string;
};

type ApiPayload = {
  now: string;
  onDuty: OnDutyRow[];
};

function formatShiftWindow(row: OnDutyRow): string {
  const z = row.location.timezone;
  const start = DateTime.fromISO(row.shiftStart, { zone: "utc" }).setZone(z);
  const end = DateTime.fromISO(row.shiftEnd, { zone: "utc" }).setZone(z);
  return `${start.toFormat("ccc LLL d")} · ${start.toFormat("h:mm a")} – ${end.toFormat("h:mm a")}`;
}

function formatClockedIn(row: OnDutyRow): string {
  const z = row.location.timezone;
  return DateTime.fromISO(row.clockInUtc, { zone: "utc" }).setZone(z).toFormat("h:mm a");
}

function formatDurationMinutes(clockInIso: string, nowIso: string): string {
  const a = DateTime.fromISO(clockInIso, { zone: "utc" });
  const b = DateTime.fromISO(nowIso, { zone: "utc" });
  const totalMins = Math.max(0, Math.floor(b.diff(a, "minutes").as("minutes")));
  const h = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (h >= 48) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h ${mins}m`;
  }
  if (h > 0) return `${h}h ${mins}m`;
  return `${mins}m`;
}

export function OnDutyClient() {
  const [locations, setLocations] = useState<Loc[]>([]);
  const [locId, setLocId] = useState("");
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOnDuty = useCallback(async () => {
    const url = new URL("/api/live/on-duty", window.location.origin);
    if (locId) url.searchParams.set("locationId", locId);
    const res = await fetch(url.toString());
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Could not load");
      setData(null);
      return;
    }
    setError(null);
    setData(json as ApiPayload);
  }, [locId]);

  useEffect(() => {
    void fetch("/api/locations")
      .then((r) => r.json())
      .then((d) => {
        const locs: Loc[] = d.locations ?? [];
        setLocations(locs);
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchOnDuty().finally(() => setLoading(false));
  }, [fetchOnDuty]);

  useEffect(() => {
    const t = setInterval(() => {
      void fetchOnDuty();
    }, 5000);
    return () => clearInterval(t);
  }, [fetchOnDuty]);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type?: string; locationId?: string };
        if (msg.type === "ping" || msg.type === "connected") return;
        if (msg.type === "on_duty") {
          if (!locId || msg.locationId === locId) void fetchOnDuty();
        }
      } catch {
        /* ignore */
      }
    };
    return () => {
      es.close();
      setSseConnected(false);
    };
  }, [locId, fetchOnDuty]);

  const rows = data?.onDuty ?? [];
  const nowIso = data?.now;

  const subtitle = useMemo(() => {
    if (!nowIso) return null;
    return DateTime.fromISO(nowIso, { zone: "utc" }).toLocal().toFormat("ccc, LLL d · h:mm:ss a");
  }, [nowIso]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Location</label>
          <select
            className="mt-1 min-w-[220px] rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            value={locId}
            onChange={(e) => setLocId(e.target.value)}
          >
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.code})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
          {subtitle ? <span className="font-mono text-zinc-400">As of {subtitle}</span> : null}
          <div
            className="flex items-center gap-2"
            title="Updates every 5s and when someone clocks in or out"
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                sseConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-zinc-600"
              }`}
            />
            <span>{sseConnected ? "Live" : "Connecting…"}</span>
          </div>
          <button
            type="button"
            onClick={() => void fetchOnDuty()}
            className="rounded-lg border border-zinc-600 px-2 py-1 text-zinc-400 hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <p className="text-xs uppercase tracking-wider text-zinc-500">On duty now</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-100">{rows.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 sm:col-span-2">
          <p className="text-xs text-zinc-500">
            Shows open clock-ins (not clocked out). Times use each site&apos;s timezone. Staff clock in/out from
            their assignment within the allowed window around the shift.
          </p>
        </div>
      </div>

      {error ? <p className="mt-6 text-sm text-rose-400">{error}</p> : null}

      {loading && !data ? (
        <p className="mt-8 text-sm text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/20 px-6 py-12 text-center">
          <p className="text-zinc-400">No one is clocked in right now</p>
          <p className="mt-2 text-sm text-zinc-600">
            When staff clock in for a shift, they appear here until they clock out.
          </p>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Staff</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Scheduled shift</th>
                <th className="px-4 py-3 font-medium">Clocked in</th>
                <th className="px-4 py-3 font-medium">On duty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/90">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-900/40">
                  <td className="px-4 py-3 font-medium text-zinc-100">{row.user.name}</td>
                  <td className="px-4 py-3 text-zinc-300">
                    {row.location.name}
                    <span className="ml-2 text-xs text-zinc-600">({row.location.code})</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{formatShiftWindow(row)}</td>
                  <td className="px-4 py-3 tabular-nums text-zinc-400">{formatClockedIn(row)}</td>
                  <td className="px-4 py-3 tabular-nums text-amber-200/90">
                    {nowIso ? formatDurationMinutes(row.clockInUtc, nowIso) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
