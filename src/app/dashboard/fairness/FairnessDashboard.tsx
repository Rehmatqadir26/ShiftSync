"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Loc = { id: string; name: string };

type FairnessStaff = {
  userId: string;
  name: string;
  totalHours: number;
  premiumHours: number;
  desired: number;
  deltaVersusDesired: number;
};

type FairnessPayload = {
  location: string;
  period: { start: string; end: string };
  staff: FairnessStaff[];
  fairnessScore: number;
  note: string;
  error?: string;
};

type OtDriver = { id: string; hours: number; label: string };

type OtStaff = {
  name: string;
  weeklyHours: number;
  projectedOtHours: number;
  projectedOtCostUsd: number;
  drivers: OtDriver[];
};

type OtPayload = {
  weekLabel: string;
  staff: OtStaff[];
  note: string;
  error?: string;
};

function fmtHours(n: number) {
  if (Number.isNaN(n)) return "—";
  return (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function fmtUsd(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function scoreTone(score: number): string {
  if (score >= 75) return "text-emerald-400";
  if (score >= 50) return "text-amber-300";
  return "text-rose-400";
}

function deltaTone(d: number): string {
  if (d > 2) return "text-rose-300";
  if (d < -2) return "text-sky-300";
  return "text-zinc-300";
}

export function FairnessDashboard() {
  const [role, setRole] = useState<string | null>(null);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [locId, setLocId] = useState("");
  const [tab, setTab] = useState<"fairness" | "ot">("fairness");

  const [rangePreset, setRangePreset] = useState<"7" | "14" | "30" | "custom">("14");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const [otWeekDate, setOtWeekDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });

  const [fairness, setFairness] = useState<FairnessPayload | null>(null);
  const [fairnessLoading, setFairnessLoading] = useState(false);
  const [fairnessErr, setFairnessErr] = useState<string | null>(null);

  const [ot, setOt] = useState<OtPayload | null>(null);
  const [otLoading, setOtLoading] = useState(false);
  const [otErr, setOtErr] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setRole(d.user?.role ?? null));
  }, []);

  useEffect(() => {
    void fetch("/api/locations")
      .then((r) => r.json())
      .then((d) => {
        const locs: Loc[] = d.locations ?? [];
        setLocations(locs);
        setLocId((prev) => prev || locs[0]?.id || "");
      });
  }, []);

  const fairnessRange = useMemo(() => {
    const end = new Date();
    let start = new Date();
    if (rangePreset === "custom" && customStart && customEnd) {
      return {
        start: new Date(customStart + "T00:00:00.000Z"),
        end: new Date(customEnd + "T23:59:59.999Z"),
      };
    }
    const days = rangePreset === "7" ? 7 : rangePreset === "30" ? 30 : 14;
    start = new Date();
    start.setDate(start.getDate() - days);
    return { start, end };
  }, [rangePreset, customStart, customEnd]);

  const loadFairness = useCallback(async () => {
    if (!locId || role == null || role === "STAFF") return;
    setFairnessLoading(true);
    setFairnessErr(null);
    const url = new URL("/api/analytics/fairness", window.location.origin);
    url.searchParams.set("locationId", locId);
    url.searchParams.set("start", fairnessRange.start.toISOString());
    url.searchParams.set("end", fairnessRange.end.toISOString());
    const res = await fetch(url.toString());
    const data = await res.json().catch(() => ({}));
    setFairnessLoading(false);
    if (!res.ok) {
      setFairnessErr(typeof data.error === "string" ? data.error : "Could not load fairness data");
      setFairness(null);
      return;
    }
    setFairness(data as FairnessPayload);
  }, [locId, role, fairnessRange.start, fairnessRange.end]);

  const loadOt = useCallback(async () => {
    if (!locId || role == null || role === "STAFF") return;
    setOtLoading(true);
    setOtErr(null);
    const ref = new Date(otWeekDate + "T12:00:00");
    const url = new URL("/api/analytics/overtime", window.location.origin);
    url.searchParams.set("locationId", locId);
    url.searchParams.set("reference", ref.toISOString());
    const res = await fetch(url.toString());
    const data = await res.json().catch(() => ({}));
    setOtLoading(false);
    if (!res.ok) {
      setOtErr(typeof data.error === "string" ? data.error : "Could not load overtime data");
      setOt(null);
      return;
    }
    setOt(data as OtPayload);
  }, [locId, role, otWeekDate]);

  useEffect(() => {
    if (tab !== "fairness") return;
    if (role !== "ADMIN" && role !== "MANAGER") return;
    void loadFairness();
  }, [tab, loadFairness, role]);

  useEffect(() => {
    if (tab !== "ot") return;
    if (role !== "ADMIN" && role !== "MANAGER") return;
    void loadOt();
  }, [tab, loadOt, role]);

  const maxPremium = useMemo(() => {
    const rows = fairness?.staff ?? [];
    return Math.max(0.01, ...rows.map((r) => r.premiumHours));
  }, [fairness]);

  const otTotals = useMemo(() => {
    const rows = ot?.staff ?? [];
    const otH = rows.reduce((s, r) => s + r.projectedOtHours, 0);
    const cost = rows.reduce((s, r) => s + r.projectedOtCostUsd, 0);
    return { otHours: otH, otCost: cost, count: rows.filter((r) => r.projectedOtHours > 0).length };
  }, [ot]);

  if (role === null) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    );
  }

  if (role === "STAFF") {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="max-w-md text-sm text-zinc-400">
          Analytics are available to managers and admins only.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Location</label>
            <select
              className="mt-1 min-w-[200px] rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              value={locId}
              onChange={(e) => setLocId(e.target.value)}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex rounded-lg border border-zinc-700 p-0.5">
            <button
              type="button"
              onClick={() => setTab("fairness")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === "fairness" ? "bg-zinc-800 text-amber-200" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Fairness
            </button>
            <button
              type="button"
              onClick={() => setTab("ot")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === "ot" ? "bg-zinc-800 text-amber-200" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Overtime
            </button>
          </div>
        </div>

        {tab === "fairness" ? (
          <section className="mt-8 space-y-6">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <span className="block text-xs font-medium text-zinc-500">Period</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(["7", "14", "30"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setRangePreset(d)}
                      className={`rounded-lg border px-2.5 py-1 text-xs ${
                        rangePreset === d
                          ? "border-amber-500/50 bg-amber-950/30 text-amber-200"
                          : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                      }`}
                    >
                      Last {d}d
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setRangePreset("custom")}
                    className={`rounded-lg border px-2.5 py-1 text-xs ${
                      rangePreset === "custom"
                        ? "border-amber-500/50 bg-amber-950/30 text-amber-200"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    Custom
                  </button>
                </div>
              </div>
              {rangePreset === "custom" ? (
                <div className="flex flex-wrap gap-2">
                  <div>
                    <label className="text-xs text-zinc-500">Start</label>
                    <input
                      type="date"
                      className="mt-0.5 block rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">End</label>
                    <input
                      type="date"
                      className="mt-0.5 block rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadFairness()}
                    className="self-end rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-amber-400"
                  >
                    Apply
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void loadFairness()}
                  className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  Refresh
                </button>
              )}
            </div>

            {fairnessErr ? (
              <p className="text-sm text-rose-400">{fairnessErr}</p>
            ) : null}

            {fairnessLoading ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : fairness ? (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                    <p className="text-xs uppercase tracking-wider text-zinc-500">Fairness score</p>
                    <p className={`mt-2 text-4xl font-semibold tabular-nums ${scoreTone(fairness.fairnessScore)}`}>
                      {fairness.fairnessScore}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">Higher = more even premium spread.</p>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 sm:col-span-2">
                    <p className="text-xs uppercase tracking-wider text-zinc-500">Period</p>
                    <p className="mt-2 text-sm text-zinc-200">{fairness.location}</p>
                    <p className="mt-1 font-mono text-xs text-zinc-500">
                      {new Date(fairness.period.start).toLocaleString()} →{" "}
                      {new Date(fairness.period.end).toLocaleString()}
                    </p>
                    <p className="mt-3 text-xs leading-relaxed text-zinc-500">{fairness.note}</p>
                  </div>
                </div>

                {fairness.staff.length === 0 ? (
                  <p className="text-sm text-zinc-500">No assignments in this period.</p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-zinc-800">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
                        <tr>
                          <th className="px-4 py-3 font-medium">Staff</th>
                          <th className="px-4 py-3 font-medium tabular-nums">Total hrs</th>
                          <th className="px-4 py-3 font-medium tabular-nums">Premium hrs</th>
                          <th className="px-4 py-3 font-medium tabular-nums">Desired / wk</th>
                          <th className="px-4 py-3 font-medium tabular-nums">Δ vs desired</th>
                          <th className="px-4 py-3 font-medium">Premium share</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/80">
                        {fairness.staff.map((row) => (
                          <tr key={row.userId} className="hover:bg-zinc-900/30">
                            <td className="px-4 py-3 font-medium text-zinc-200">{row.name}</td>
                            <td className="px-4 py-3 tabular-nums text-zinc-300">{fmtHours(row.totalHours)}</td>
                            <td className="px-4 py-3 tabular-nums text-zinc-300">{fmtHours(row.premiumHours)}</td>
                            <td className="px-4 py-3 tabular-nums text-zinc-400">{fmtHours(row.desired)}</td>
                            <td className={`px-4 py-3 tabular-nums ${deltaTone(row.deltaVersusDesired)}`}>
                              {row.deltaVersusDesired >= 0 ? "+" : ""}
                              {fmtHours(row.deltaVersusDesired)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-full max-w-[120px] overflow-hidden rounded-full bg-zinc-800">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-amber-700 to-amber-400"
                                    style={{ width: `${Math.min(100, (row.premiumHours / maxPremium) * 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs tabular-nums text-zinc-500">
                                  {row.totalHours > 0
                                    ? `${Math.round((row.premiumHours / row.totalHours) * 100)}%`
                                    : "—"}
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </section>
        ) : (
          <section className="mt-8 space-y-6">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500">Week (pick any day)</label>
                <input
                  type="date"
                  className="mt-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                  value={otWeekDate}
                  onChange={(e) => setOtWeekDate(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => void loadOt()}
                className="rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Refresh
              </button>
            </div>

            {otErr ? <p className="text-sm text-rose-400">{otErr}</p> : null}
            {otLoading ? <p className="text-sm text-zinc-500">Loading…</p> : null}

            {!otLoading && ot ? (
              <>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">Payroll week</p>
                  <p className="mt-2 text-lg text-zinc-100">{ot.weekLabel}</p>
                  <p className="mt-3 text-xs text-zinc-500">{ot.note}</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                    <p className="text-xs text-zinc-500">Staff with OT</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">{otTotals.count}</p>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                    <p className="text-xs text-zinc-500">Projected OT hours</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-200">
                      {fmtHours(otTotals.otHours)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                    <p className="text-xs text-zinc-500">Projected OT cost</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-300">
                      {fmtUsd(otTotals.otCost)}
                    </p>
                  </div>
                </div>

                {ot.staff.length === 0 ? (
                  <p className="text-sm text-zinc-500">No assignments this week.</p>
                ) : (
                  <div className="space-y-4">
                    {ot.staff.map((row) => (
                      <div
                        key={row.name}
                        className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-3">
                          <div>
                            <p className="font-medium text-zinc-100">{row.name}</p>
                            <p className="mt-0.5 text-xs text-zinc-500">
                              {row.projectedOtHours > 0 ? (
                                <>
                                  OT {fmtHours(row.projectedOtHours)} hrs · {fmtUsd(row.projectedOtCostUsd)} est.
                                </>
                              ) : (
                                "No OT this week"
                              )}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-zinc-500">Weekly hours</p>
                            <p className="text-lg font-semibold tabular-nums text-zinc-200">
                              {fmtHours(row.weeklyHours)}
                            </p>
                          </div>
                        </div>
                        {row.drivers.length > 0 ? (
                          <div className="px-4 py-3">
                            <p className="text-xs font-medium text-zinc-500">Largest shifts</p>
                            <ul className="mt-2 flex flex-wrap gap-2">
                              {row.drivers.map((d) => (
                                <li
                                  key={d.id}
                                  className="rounded-md border border-zinc-800 bg-zinc-950/50 px-2 py-1 text-xs text-zinc-400"
                                >
                                  <span className="text-zinc-300">{d.label}</span>
                                  <span className="ml-2 tabular-nums text-zinc-500">{fmtHours(d.hours)}h</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </section>
        )}
    </div>
  );
}
