"use client";

import { useCallback, useEffect, useState } from "react";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

type Prefs = { inAppEnabled: boolean; emailSimEnabled: boolean };

type SimEmail = { id: string; subject: string; body: string; createdAt: string };

export function NotificationsClient() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [simEmails, setSimEmails] = useState<SimEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [n, p, s] = await Promise.all([
        fetch("/api/notifications").then((r) => r.json()),
        fetch("/api/notifications/preferences").then((r) => r.json()),
        fetch("/api/simulated-emails").then((r) => r.json()),
      ]);
      setItems(n.notifications ?? []);
      setPrefs(p.preferences ?? { inAppEnabled: true, emailSimEnabled: false });
      setSimEmails(s.emails ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type?: string };
        if (msg.type === "notification") void load();
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [load]);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    void load();
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    void load();
  }

  async function savePrefs(next: Partial<Prefs>) {
    if (!prefs) return;
    setSaving(true);
    setMessage(null);
    const body = { ...prefs, ...next };
    const res = await fetch("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error ?? "Could not save preferences");
      return;
    }
    setPrefs(data.preferences);
    setMessage("Preferences saved");
  }

  const unread = items.filter((x) => !x.readAt).length;

  if (loading && !prefs) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  return (
    <div className="space-y-10">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <h2 className="text-lg font-medium text-white">Notification preferences</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Choose in-app alerts and/or a simulated email log (no real email is sent).
        </p>
        {prefs ? (
          <div className="mt-4 space-y-3">
            <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-200">
              <input
                type="checkbox"
                className="rounded border-zinc-600"
                checked={prefs.inAppEnabled}
                disabled={saving}
                onChange={(e) => void savePrefs({ inAppEnabled: e.target.checked })}
              />
              In-app notifications
            </label>
            <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-200">
              <input
                type="checkbox"
                className="rounded border-zinc-600"
                checked={prefs.emailSimEnabled}
                disabled={saving}
                onChange={(e) => void savePrefs({ emailSimEnabled: e.target.checked })}
              />
              Also log simulated emails (same events, shown below)
            </label>
          </div>
        ) : null}
        {message ? <p className="mt-3 text-sm text-amber-200/90">{message}</p> : null}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-white">In-app inbox</h2>
            <p className="text-sm text-zinc-500">
              {unread === 0 ? "All caught up" : `${unread} unread`}
            </p>
          </div>
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Mark all read
            </button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">No notifications yet.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((n) => (
              <li
                key={n.id}
                className={`rounded-lg border px-4 py-3 text-sm ${
                  n.readAt
                    ? "border-zinc-800 bg-zinc-950/50 text-zinc-500"
                    : "border-amber-500/30 bg-amber-950/20 text-zinc-100"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-zinc-100">{n.title}</p>
                    <p className="mt-1 text-zinc-400">{n.body}</p>
                    <p className="mt-2 text-xs text-zinc-600">
                      {new Date(n.createdAt).toLocaleString()} · {n.type}
                    </p>
                  </div>
                  {!n.readAt ? (
                    <button
                      type="button"
                      onClick={() => void markRead(n.id)}
                      className="shrink-0 text-xs text-amber-400 hover:underline"
                    >
                      Mark read
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium text-white">Simulated email log</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Entries appear when “simulated emails” is on and events fire. Useful to demo what would have been
          emailed.
        </p>
        {simEmails.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No simulated emails yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {simEmails.map((e) => (
              <li
                key={e.id}
                className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3 font-mono text-xs text-zinc-300"
              >
                <p className="text-zinc-500">{new Date(e.createdAt).toLocaleString()}</p>
                <p className="mt-1 font-sans text-sm font-medium text-zinc-200">{e.subject}</p>
                <pre className="mt-2 whitespace-pre-wrap text-zinc-400">{e.body}</pre>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
