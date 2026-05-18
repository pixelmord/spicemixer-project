import { LocalSourceStore } from "@/lib/source-store/index.ts";
import { join } from "node:path";

export function createSourceStore() {
  return new LocalSourceStore(join(process.cwd(), "data/sources"));
}
