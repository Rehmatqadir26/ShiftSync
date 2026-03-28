"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  createdAt: string;
  actorEmail: string;
  actorName: string;
  entityType: string;
  entityId: string;
  action: string;
  reason: string | null;
  before: unknown;
  after: unknown;
};

type ListResponse = {
  items: Row[];
  total: number;
  limit: number;
  offset: number;
};

const PAGE = 50;

const ENTITY_OPTIONS = ["", "Shift", "ShiftAssignment", "CoverageRequest"];
const ACTION_OPTIONS = ["", "CREATE", "UPDATE", "APPROVE"];

function JsonPeek({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  const str = JSON.stringify(value, null, 2);
  if (str === "{}") return null;
  return (
    <details className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950/80">
      <summary className="cursor-pointer px-2 py-1 text-xs text-zinc-500">{label}</summary>
      <pre className="max-h-40 overflow-auto p-2 text-[11px] leading-relaxed text-zinc-400">{str}</pre>
    </details>
  );
}

export function AuditLogClient() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(PAGE));
    p.set("offset", String(offset));
    if (start) p.set("start", new Date(start + "T00:00:00.000Z").toISOString());
    if (end) p.set("end", new Date(end + "T23:59:59.999Z").toISOString());
    if (entityType) p.set("entityType", entityType);
    if (action) p.set("action", action);
    return p;
  }, [offset, start, end, entityType, action]);

  const exportParams = useMemo(() => {
    const p = new URLSearchParams();
    if (start) p.set("start", new Date(start + "T00:00:00.000Z").toISOString());
    if (end) p.set("end", new Date(end + "T23:59:59.999Z").toISOString());
    if (entityType) p.set("entityType", entityType);
    if (action) p.set("action", action);
    return p.toString();
  }, [start, end, entityType, action]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const res = await fetch(`/api/audit?${queryParams.toString()}`);
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setErr(typeof json.error === "string" ? json.error : "Failed to load audit log");
      setData(null);
      return;
    }
    setData(json as ListResponse);
  }, [queryParams]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE < total;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-zinc-500">From</label>
          <input
            type="date"
            className="mt-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
            value={start}
            onChange={(e) => {
              setOffset(0);
              setStart(e.target.value);
            }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">To</label>
          <input
            type="date"
            className="mt-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
            value={end}
            onChange={(e) => {
              setOffset(0);
              setEnd(e.target.value);
            }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Entity</label>
          <select
            className="mt-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
            value={entityType}
            onChange={(e) => {
              setOffset(0);
              setEntityType(e.target.value);
            }}
          >
            {ENTITY_OPTIONS.map((v) => (
              <option key={v || "all"} value={v}>
                {v || "All types"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Action</label>
          <select
            className="mt-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
            value={action}
            onChange={(e) => {
              setOffset(0);
              setAction(e.target.value);
            }}
          >
            {ACTION_OPTIONS.map((v) => (
              <option key={v || "all"} value={v}>
                {v || "All actions"}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Refresh
        </button>
        <a
          href={`/api/audit/export${exportParams ? `?${exportParams}` : ""}`}
          className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400"
        >
          Download CSV
        </a>
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        Export includes up to 50,000 rows matching the filters above (no pagination).
      </p>

      {err ? <p className="mt-4 text-sm text-rose-400">{err}</p> : null}

      {loading ? <p className="mt-6 text-sm text-zinc-500">Loading…</p> : null}

      {!loading && data ? (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-400">
            <span>
              {total === 0 ? "No entries" : `Showing ${from}–${to} of ${total}`}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!canPrev}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
                className="rounded-lg border border-zinc-600 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!canNext}
                onClick={() => setOffset((o) => o + PAGE)}
                className="rounded-lg border border-zinc-600 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {data.items.map((row) => (
              <article
                key={row.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-zinc-500">{row.createdAt}</p>
                    <p className="mt-1 text-zinc-100">
                      <span className="font-medium text-amber-200/90">{row.action}</span>
                      <span className="text-zinc-500"> · </span>
                      <span>{row.entityType}</span>
                      <span className="text-zinc-500"> · </span>
                      <span className="font-mono text-xs text-zinc-400">{row.entityId}</span>
                    </p>
                    <p className="mt-1 text-zinc-400">
                      {row.actorName} <span className="text-zinc-600">&lt;{row.actorEmail}&gt;</span>
                    </p>
                    {row.reason ? (
                      <p className="mt-2 text-xs text-zinc-500">
                        <span className="text-zinc-600">Note:</span> {row.reason}
                      </p>
                    ) : null}
                  </div>
                </div>
                <JsonPeek label="Before" value={row.before} />
                <JsonPeek label="After" value={row.after} />
              </article>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
