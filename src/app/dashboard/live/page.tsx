"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function LivePage() {
  const [data, setData] = useState<unknown>(null);

  useEffect(() => {
    const t = setInterval(() => {
      void fetch("/api/live/on-duty")
        .then((r) => r.json())
        .then(setData);
    }, 4000);
    void fetch("/api/live/on-duty")
      .then((r) => r.json())
      .then(setData);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type?: string };
        if (msg.type === "on_duty") {
          void fetch("/api/live/on-duty")
            .then((r) => r.json())
            .then(setData);
        }
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
      <Link href="/dashboard" className="text-sm text-amber-300 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-xl font-semibold">On duty now</h1>
      <p className="mt-1 text-sm text-zinc-500">Polls every few seconds and listens on SSE for clock events.</p>
      <pre className="mt-6 overflow-auto rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-xs text-zinc-300">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
