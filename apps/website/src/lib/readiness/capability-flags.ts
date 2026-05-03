import type { ContentStore } from "../content-store.ts";
import defaultFlags from "./capability-flags.json";

const FLAGS_COLLECTION = "meta" as const;
const FLAGS_ID = "readiness/capability-flags";

export interface CapabilityFlag {
  key: string;
  label: string;
  complete: boolean;
  completedAt: string | null;
  completedBy: string | null;
  notes: string;
}

export async function loadFlags(store: ContentStore): Promise<CapabilityFlag[]> {
  const item = await store.get(FLAGS_COLLECTION, FLAGS_ID);
  if (item !== null) {
    return item.data as CapabilityFlag[];
  }
  return defaultFlags as CapabilityFlag[];
}

export async function toggleFlag(
  store: ContentStore,
  key: string,
  completedBy: string,
): Promise<CapabilityFlag[]> {
  const flags = await loadFlags(store);
  const idx = flags.findIndex((f) => f.key === key);
  if (idx === -1) throw new Error(`Unknown capability flag key: ${key}`);

  const flag = flags[idx];
  const updated: CapabilityFlag = flag.complete
    ? { ...flag, complete: false, completedAt: null, completedBy: null }
    : { ...flag, complete: true, completedAt: new Date().toISOString(), completedBy };

  const newFlags = [...flags.slice(0, idx), updated, ...flags.slice(idx + 1)];
  await store.put(FLAGS_COLLECTION, FLAGS_ID, newFlags);
  return newFlags;
}
