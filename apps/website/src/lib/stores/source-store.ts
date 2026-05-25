import { LocalSourceStore } from "@/lib/source-store/local.ts";
import { join } from "node:path";

export function createSourceStore() {
  return new LocalSourceStore(join(process.cwd(), "data/sources"));
}
