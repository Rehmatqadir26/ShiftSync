"use client";

import { useCallback, useEffect, useState } from "react";

const TZ_PRESETS = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/Berlin",
  "UTC",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Profile = {
  desiredHoursWeekly: number;
  availabilityTimezone: string;
  hourlyRateCents: number;
};

function minutesToInput(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function inputToMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

type DayEdit = { enabled: boolean; start: string; end: string };

export function ProfileClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [days, setDays] = useState<DayEdit[]>(() =>
    Array.from({ length: 7 }, () => ({ enabled: false, start: "09:00", end: "17:00" })),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/me/profile");
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Could not load profile");
      return;
    }
    setErr(null);
    setProfile(data.profile);
    const next = Array.from({ length: 7 }, () => ({ enabled: false, start: "09:00", end: "17:00" }));
    for (const r of data.recurring ?? []) {
      if (r.dayOfWeek >= 0 && r.dayOfWeek <= 6) {
        next[r.dayOfWeek] = {
          enabled: true,
          start: minutesToInput(r.startMinute),
          end: minutesToInput(r.endMinute),
        };
      }
    }
    setDays(next);
    setMsg(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    const res = await fetch("/api/me/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        desiredHoursWeekly: profile.desiredHoursWeekly,
        availabilityTimezone: profile.availabilityTimezone,
        hourlyRateCents: Math.round(profile.hourlyRateCents),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Save failed");
      return;
    }
    setProfile(data.profile);
    setMsg("Profile saved");
  }

  async function saveAvailability() {
    setErr(null);
    const windows: { dayOfWeek: number; startMinute: number; endMinute: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const day = days[d];
      if (!day.enabled) continue;
      const sm = inputToMinutes(day.start);
      const em = inputToMinutes(day.end);
      if (sm === null || em === null) {
        setErr(`Invalid time on ${DAY_NAMES[d]}`);
        return;
      }
      if (sm >= em) {
        setErr(`${DAY_NAMES[d]}: end must be after start`);
        return;
      }
      windows.push({ dayOfWeek: d, startMinute: sm, endMinute: em });
    }
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/me/availability/recurring", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ windows }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Could not save availability");
      return;
    }
    setMsg("Availability saved");
  }

  if (loading || !profile) {
    return (
      <div className="px-4 py-8">
        <p className="text-sm text-zinc-500">{loading ? "Loading…" : "No profile"}</p>
        {err ? <p className="mt-2 text-sm text-rose-400">{err}</p> : null}
      </div>
    );
  }

  const rateDollars = (profile.hourlyRateCents / 100).toFixed(2);

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <h2 className="text-lg font-medium text-white">Work preferences</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Used for fairness scoring and OT estimates. Availability windows are interpreted in your availability
          timezone.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs text-zinc-500">Desired hours / week</label>
            <input
              type="number"
              min={0}
              max={80}
              step={0.5}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              value={profile.desiredHoursWeekly}
              onChange={(e) =>
                setProfile({ ...profile, desiredHoursWeekly: Number(e.target.value) || 0 })
              }
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500">Hourly rate (USD, for OT demo)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              value={rateDollars}
              onChange={(e) => {
                const n = Number(e.target.value);
                setProfile({
                  ...profile,
                  hourlyRateCents: Number.isFinite(n) ? Math.round(n * 100) : 0,
                });
              }}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-zinc-500">Availability timezone</label>
            <select
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              value={profile.availabilityTimezone}
              onChange={(e) => setProfile({ ...profile, availabilityTimezone: e.target.value })}
            >
              {TZ_PRESETS.includes(profile.availabilityTimezone) ? null : (
                <option value={profile.availabilityTimezone}>{profile.availabilityTimezone}</option>
              )}
              {TZ_PRESETS.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-600">
              Shifts are checked against recurring windows using this zone.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void saveProfile()}
          className="mt-6 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
        >
          Save preferences
        </button>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <h2 className="text-lg font-medium text-white">Weekly availability</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Toggle days you can work and set hours (wall clock in your availability timezone).
        </p>
        <div className="mt-4 space-y-3">
          {days.map((day, d) => (
            <div
              key={d}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2"
            >
              <label className="flex w-16 items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  className="rounded border-zinc-600"
                  checked={day.enabled}
                  onChange={(e) => {
                    const next = [...days];
                    next[d] = { ...next[d], enabled: e.target.checked };
                    setDays(next);
                  }}
                />
                {DAY_NAMES[d]}
              </label>
              {day.enabled ? (
                <>
                  <input
                    type="time"
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    value={day.start}
                    onChange={(e) => {
                      const next = [...days];
                      next[d] = { ...next[d], start: e.target.value };
                      setDays(next);
                    }}
                  />
                  <span className="text-zinc-600">–</span>
                  <input
                    type="time"
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    value={day.end}
                    onChange={(e) => {
                      const next = [...days];
                      next[d] = { ...next[d], end: e.target.value };
                      setDays(next);
                    }}
                  />
                </>
              ) : (
                <span className="text-xs text-zinc-600">Unavailable</span>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void saveAvailability()}
          className="mt-6 rounded-lg border border-amber-500/40 bg-amber-950/20 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-950/40 disabled:opacity-50"
        >
          Save availability
        </button>
      </section>

      {err ? <p className="text-sm text-rose-400">{err}</p> : null}
      {msg ? <p className="text-sm text-emerald-300/90">{msg}</p> : null}
    </div>
  );
}
