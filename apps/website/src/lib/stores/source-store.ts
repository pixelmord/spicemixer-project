import { LocalSourceStore } from "content-ai";
import { join } from "node:path";

export function createSourceStore() {
  return new LocalSourceStore(join(process.cwd(), "data/sources"));
}
