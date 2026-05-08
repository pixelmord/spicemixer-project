import { publish } from "../../pubsub.ts";
import type { TraceSink, TraceEvent } from "./types.ts";

export class PubSubTraceSink implements TraceSink {
  async emit(event: TraceEvent): Promise<void> {
    publish(event.runId, {
      type: "trace",
      traceId: event.traceId,
      action: event.origin.action,
      finishReason: event.finishReason,
      durationMs: event.durationMs,
    });
  }
}
