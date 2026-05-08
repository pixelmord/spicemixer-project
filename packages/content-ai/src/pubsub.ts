export interface PubSubEvent {
  type: string;
  [key: string]: unknown;
}

type Subscriber = (event: PubSubEvent) => void;

const channels = new Map<string, Set<Subscriber>>();

export function subscribe(runId: string, cb: Subscriber): () => void {
  let subs = channels.get(runId);
  if (!subs) {
    subs = new Set();
    channels.set(runId, subs);
  }
  subs.add(cb);
  const captured = subs;
  return () => {
    captured.delete(cb);
    if (!captured.size) channels.delete(runId);
  };
}

export function publish(runId: string, event: PubSubEvent): void {
  channels.get(runId)?.forEach((cb) => cb(event));
}
