"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Loc = { id: string; name: string; code: string; timezone: string };
type ShiftRow = {
  id: string;
  headcount: number;
  notes: string | null;
  displayStart: string | null;
  displayEnd: string | null;
  published: boolean;
  location: Loc;
  requiredSkill: { id: string; name: string };
  assignments: { id: string; user: { id: string; name: string } }[];
};

type SkillOpt = { id: string; name: string };

type StaffRow = { id: string; name: string };

export function ScheduleBoard() {
  const [locations, setLocations] = useState<Loc[]>([]);
  const [locId, setLocId] = useState("");
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [role, setRole] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [violations, setViolations] = useState<unknown[]>([]);
  const [suggestions, setSuggestions] = useState<{ id: string; name: string }[]>([]);
  const [pickShift, setPickShift] = useState<string | null>(null);
  const [pickUser, setPickUser] = useState("");
  const [skills, setSkills] = useState<SkillOpt[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createStart, setCreateStart] = useState("");
  const [createEnd, setCreateEnd] = useState("");
  const [createSkillId, setCreateSkillId] = useState("");
  const [createHeadcount, setCreateHeadcount] = useState(1);
  const [createNotes, setCreateNotes] = useState("");
  const [sseConnected, setSseConnected] = useState(false);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const liveNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Suppress “live” toast when SSE echoes a mutation we just made. */
  const lastLocalScheduleMutationAt = useRef(0);
  const [previewWarnings, setPreviewWarnings] = useState<{ message?: string }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    const me = await fetch("/api/auth/me").then((r) => r.json());
    if (!me.user) return;
    setRole(me.user.role);
    const ls = await fetch("/api/locations").then((r) => r.json());
    setLocations(ls.locations ?? []);
    const first = ls.locations?.[0]?.id ?? "";
    setLocId((prev) => prev || first);
    if (me.user?.role === "ADMIN" || me.user?.role === "MANAGER") {
      const sk = await fetch("/api/skills").then((r) => r.json());
      setSkills(sk.skills ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (liveNoticeTimer.current) clearTimeout(liveNoticeTimer.current);
    };
  }, []);

  const reloadScheduleData = useCallback(
    async (opts?: { fromSse?: boolean }) => {
      if (!locId) return;
      const [shiftsRes, staffRes] = await Promise.all([
        fetch(`/api/shifts?locationId=${encodeURIComponent(locId)}`),
        fetch(`/api/staff?locationId=${encodeURIComponent(locId)}`),
      ]);
      const shiftsJson = await shiftsRes.json().catch(() => ({}));
      setShifts(shiftsJson.shifts ?? []);
      if (staffRes.ok) {
        const staffJson = await staffRes.json().catch(() => ({}));
        setStaff(staffJson.staff ?? []);
      } else {
        setStaff([]);
      }
      if (opts?.fromSse && Date.now() - lastLocalScheduleMutationAt.current > 2000) {
        if (liveNoticeTimer.current) clearTimeout(liveNoticeTimer.current);
        setLiveNotice("Schedule updated (live)");
        liveNoticeTimer.current = setTimeout(() => {
          setLiveNotice(null);
          liveNoticeTimer.current = null;
        }, 4000);
      }
    },
    [locId],
  );

  useEffect(() => {
    if (!locId) return;
    void reloadScheduleData();
  }, [locId, reloadScheduleData]);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);

    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as {
          type?: string;
          locationId?: string;
        };
        if (msg.type === "ping" || msg.type === "connected") return;
        if (msg.type === "schedule_updated" && msg.locationId && msg.locationId === locId) {
          void reloadScheduleData({ fromSse: true });
        }
      } catch {
        /* ignore malformed */
      }
    };

    return () => {
      es.close();
      setSseConnected(false);
    };
  }, [locId, reloadScheduleData]);

  async function previewAssign() {
    if (!pickShift || !pickUser) return;
    setMessage(null);
    setViolations([]);
    setSuggestions([]);
    setPreviewWarnings([]);
    setPreviewLoading(true);
    const res = await fetch(`/api/shifts/${pickShift}/assign/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: pickUser }),
    });
    const data = await res.json().catch(() => ({}));
    setPreviewLoading(false);
    if (!res.ok) {
      setMessage(data.error ?? "Preview failed");
      return;
    }
    if (!data.ok) {
      if (data.full) {
        setMessage(data.error ?? "Shift is full");
        return;
      }
      if (Array.isArray(data.violations) && data.violations.length > 0) {
        setViolations(data.violations ?? []);
        setSuggestions(data.suggestions ?? []);
        setMessage("Rules block this assignment (dry run)");
        return;
      }
      setMessage(typeof data.error === "string" ? data.error : "Cannot assign");
      return;
    }
    setPreviewWarnings(data.warnings ?? []);
    setMessage(
      (data.warnings?.length ?? 0) > 0
        ? "Preview OK — warnings below; click Assign to save."
        : "Preview OK — click Assign to save.",
    );
  }

  async function assign() {
    if (!pickShift || !pickUser) return;
    setMessage(null);
    setViolations([]);
    setSuggestions([]);
    setPreviewWarnings([]);
    const res = await fetch(`/api/shifts/${pickShift}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: pickUser }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error ?? "Request failed");
      setViolations(data.violations ?? []);
      setSuggestions(data.suggestions ?? []);
      return;
    }
    setMessage("Assigned");
    setPickShift(null);
    setPickUser("");
    setPreviewWarnings([]);
    lastLocalScheduleMutationAt.current = Date.now();
    await reloadScheduleData();
  }

  function referenceUtcForWeekAction(): string {
    const fromRow = shifts[0]?.displayStart;
    if (fromRow) return new Date(fromRow).toISOString();
    return new Date().toISOString();
  }

  async function publishWeek() {
    const ref = referenceUtcForWeekAction();
    const res = await fetch(`/api/locations/${locId}/publish-week`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referenceUtc: ref }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setMessage(data.error ?? "Publish failed");
    else {
      setMessage("Published week");
      lastLocalScheduleMutationAt.current = Date.now();
      await reloadScheduleData();
    }
  }

  async function unpublishWeek() {
    const ref = referenceUtcForWeekAction();
    const res = await fetch(`/api/locations/${locId}/publish-week`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referenceUtc: ref }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setMessage(data.error ?? "Unpublish failed");
    else {
      setMessage("Week is no longer published (draft again)");
      lastLocalScheduleMutationAt.current = Date.now();
      await reloadScheduleData();
    }
  }

  async function createShift() {
    if (!locId || !createSkillId || !createStart || !createEnd) {
      setMessage("Fill start, end, and skill");
      return;
    }
    const startUtc = new Date(createStart).toISOString();
    const endUtc = new Date(createEnd).toISOString();
    setMessage(null);
    const res = await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationId: locId,
        startUtc,
        endUtc,
        requiredSkillId: createSkillId,
        headcount: createHeadcount,
        notes: createNotes.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error ?? "Could not create shift");
      return;
    }
    setMessage("Shift created");
    setShowCreate(false);
    setCreateNotes("");
    lastLocalScheduleMutationAt.current = Date.now();
    await reloadScheduleData();
  }

  const canManage = role === "ADMIN" || role === "MANAGER";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs text-zinc-500">Location</label>
          <select
            className="mt-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            value={locId}
            onChange={(e) => setLocId(e.target.value)}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.code})
              </option>
            ))}
          </select>
        </div>
        {canManage ? (
          <>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
            >
              New shift
            </button>
            <button
              type="button"
              onClick={() => void publishWeek()}
              className="rounded-lg border border-amber-500/50 px-3 py-2 text-sm text-amber-200 hover:bg-amber-500/10"
            >
              Publish this week
            </button>
            <button
              type="button"
              onClick={() => void unpublishWeek()}
              className="rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
            >
              Unpublish this week
            </button>
          </>
        ) : null}
        </div>
        <div
          className="flex items-center gap-2 text-xs text-zinc-500"
          title="Refreshes when shifts change (assignments, publish, edits) via server push"
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${sseConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-zinc-600"}`}
            aria-hidden
          />
          <span>{sseConnected ? "Live updates on" : "Connecting…"}</span>
        </div>
      </div>
      {liveNotice ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200/90">
          {liveNotice}
        </p>
      ) : null}
      {canManage ? (
        <p className="text-xs text-zinc-500">
          Publish / unpublish use the week of the first listed shift (or today if empty). Times for new shifts use
          your browser&apos;s local timezone and are stored in UTC.
        </p>
      ) : null}

      {message ? <p className="text-sm text-amber-200/90">{message}</p> : null}
      {violations.length > 0 ? (
        <div className="rounded-lg border border-red-500/40 bg-red-950/40 p-4 text-sm">
          <p className="font-medium text-red-200">Rules blocked the assign</p>
          <ul className="mt-2 list-inside list-disc text-red-100/90">
            {(violations as { message?: string }[]).map((v, i) => (
              <li key={i}>{v.message ?? JSON.stringify(v)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {suggestions.length > 0 ? (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 text-sm">
          <p className="font-medium text-zinc-200">People who do fit</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <li key={s.id} className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200">
                {s.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">When (local)</th>
              <th className="px-4 py-3">Skill</th>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Published</th>
              {canManage ? <th className="px-4 py-3">Assign</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {shifts.map((s) => (
              <tr key={s.id} className="hover:bg-zinc-900/40">
                <td className="px-4 py-3 text-zinc-200">
                  <div>{s.displayStart ?? "—"}</div>
                  <div className="text-xs text-zinc-500">to {s.displayEnd ?? "—"}</div>
                </td>
                <td className="px-4 py-3 text-zinc-300">{s.requiredSkill.name}</td>
                <td className="px-4 py-3 text-zinc-300">
                  {s.assignments.length === 0 ? (
                    <span className="text-zinc-600">—</span>
                  ) : (
                    s.assignments.map((a) => (
                      <span key={a.id} className="mr-2 inline-block rounded bg-zinc-800 px-2 py-0.5 text-xs">
                        {a.user.name}
                      </span>
                    ))
                  )}
                  <span className="ml-2 text-xs text-zinc-600">
                    {s.assignments.length}/{s.headcount}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-400">{s.published ? "yes" : "no"}</td>
                {canManage ? (
                  <td className="px-4 py-3">
                    {s.assignments.length >= s.headcount ? (
                      <span className="text-xs text-zinc-600">Full</span>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-amber-300 hover:underline"
                        onClick={() => {
                          setPickShift(s.id);
                          setPickUser("");
                        }}
                        disabled={!canManage}
                      >
                        Add
                      </button>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && canManage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
            <h3 className="text-lg font-medium text-white">New shift</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Start and end in your local time; overnight shifts are allowed (end after start on the same or next
              calendar day).
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs text-zinc-500">Start</label>
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                  value={createStart}
                  onChange={(e) => setCreateStart(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500">End</label>
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                  value={createEnd}
                  onChange={(e) => setCreateEnd(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500">Required skill</label>
                <select
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  value={createSkillId}
                  onChange={(e) => setCreateSkillId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500">Headcount</label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  value={createHeadcount}
                  onChange={(e) => setCreateHeadcount(Number(e.target.value) || 1)}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500">Notes (optional)</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  placeholder="e.g. VIP room"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-zinc-900"
                onClick={() => void createShift()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pickShift && canManage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
            <h3 className="text-lg font-medium text-white">Assign staff</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Use <strong className="text-zinc-400">Check fit</strong> to run a dry run without saving.
            </p>
            <select
              className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              value={pickUser}
              onChange={(e) => {
                setPickUser(e.target.value);
                setPreviewWarnings([]);
              }}
            >
              <option value="">Select…</option>
              {staff.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            {previewWarnings.length > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/25 p-3 text-xs text-amber-100/90">
                <p className="font-medium text-amber-200">Warnings (still assignable)</p>
                <ul className="mt-2 list-inside list-disc">
                  {previewWarnings.map((w, i) => (
                    <li key={i}>{w.message ?? JSON.stringify(w)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
                onClick={() => {
                  setPickShift(null);
                  setPreviewWarnings([]);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                disabled={!pickUser || previewLoading}
                onClick={() => void previewAssign()}
              >
                {previewLoading ? "Checking…" : "Check fit"}
              </button>
              <button
                type="button"
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-zinc-900 disabled:opacity-50"
                disabled={!pickUser}
                onClick={() => void assign()}
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
