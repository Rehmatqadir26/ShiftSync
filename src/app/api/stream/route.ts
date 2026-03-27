import { getSession, type SessionPayload } from "@/lib/auth/session";
import { getManagerLocationIds } from "@/lib/access";
import { realtimeBus } from "@/lib/realtime/bus";

type BusEvent = {
  type: string;
  userId?: string;
  locationId?: string;
  payload?: unknown;
};

function visibleTo(session: SessionPayload, e: BusEvent): boolean {
  if (e.type === "notification" && e.userId) return e.userId === session.sub;
  if (e.type === "schedule_updated" && e.locationId) {
    if (session.role === "ADMIN") return true;
    if (session.role === "MANAGER") {
      return true;
    }
    return true;
  }
  return true;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const managerLocs =
    session.role === "MANAGER" ? await getManagerLocationIds(session.sub) : [];

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const write = (obj: object) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      write({ type: "connected", at: Date.now() });

      const handler = (raw: unknown) => {
        const e = raw as BusEvent;
        if (session.role === "MANAGER" && e.locationId && !managerLocs.includes(e.locationId)) {
          return;
        }
        if (!visibleTo(session, e)) return;
        write(e);
      };

      realtimeBus.on("event", handler);

      const ping = setInterval(() => write({ type: "ping" }), 25000);

      const close = () => {
        clearInterval(ping);
        realtimeBus.off("event", handler);
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
