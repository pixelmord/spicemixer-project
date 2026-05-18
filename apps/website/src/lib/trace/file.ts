import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { TraceSink, TraceEvent } from "@pixelmord/content-ai-core";

export class FileTraceSink implements TraceSink {
  private readonly dir: string;

  constructor(dir = ".ai-trace") {
    this.dir = dir;
  }

  async emit(event: TraceEvent): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const date = event.at.slice(0, 10);
    const file = join(this.dir, `${date}.jsonl`);
    await appendFile(file, JSON.stringify(event) + "\n", "utf8");
  }
}
