export interface PubSubEvent {
  type: string;
  [key: string]: unknown;
}

type Subscriber = (event: PubSubEvent) => void;

const channels = new Map<string, Set<Subscriber>>();

export function subscribe(runId: string, cb: Subscriber): () => void {
  let s = channels.get(runId);
  if (!s) {
    s = new Set();
    channels.set(runId, s);
  }
  s.add(cb);
  return () => {
    s!.delete(cb);
    if (!s!.size) channels.delete(runId);
  };
}

export function publish(runId: string, event: PubSubEvent): void {
  channels.get(runId)?.forEach((cb) => cb(event));
}
