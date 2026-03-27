"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Loc = { id: string; name: string };

export default function FairnessPage() {
  const [locations, setLocations] = useState<Loc[]>([]);
  const [locId, setLocId] = useState("");
  const [data, setData] = useState<unknown>(null);

  useEffect(() => {
    void fetch("/api/locations")
      .then((r) => r.json())
      .then((d) => {
        setLocations(d.locations ?? []);
        setLocId(d.locations?.[0]?.id ?? "");
      });
  }, []);

  useEffect(() => {
    if (!locId) return;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 14);
    const url = new URL("/api/analytics/fairness", window.location.origin);
    url.searchParams.set("locationId", locId);
    url.searchParams.set("start", start.toISOString());
    url.searchParams.set("end", end.toISOString());
    void fetch(url.toString())
      .then((r) => r.json())
      .then(setData);
  }, [locId]);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
      <Link href="/dashboard" className="text-sm text-amber-300 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-xl font-semibold">Fairness & premium shifts</h1>
      <div className="mt-4">
        <select
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
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
      <pre className="mt-6 overflow-auto rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-xs text-zinc-300">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
