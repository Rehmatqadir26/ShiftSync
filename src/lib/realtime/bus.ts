import { EventEmitter } from "events";

type BusPayload = {
  type: string;
  userId?: string;
  locationId?: string;
  payload?: unknown;
};

const globalKey = "__coastalRealtimeBus";
const g = globalThis as unknown as Record<string, EventEmitter>;

if (!(globalKey in g)) {
  g[globalKey] = new EventEmitter();
}
g[globalKey]!.setMaxListeners(100);

export const realtimeBus = g[globalKey] as EventEmitter;

export function emitRealtime(event: BusPayload) {
  realtimeBus.emit("event", event);
}
