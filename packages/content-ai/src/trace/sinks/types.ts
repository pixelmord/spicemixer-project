import type { Origin } from "../origin.ts";

export type TraceFinishReason =
  | "stop"
  | "length"
  | "content-filter"
  | "tool-calls"
  | "error"
  | "other"
  | "unknown";

export interface TraceEvent {
  traceId: string;
  runId: string;
  at: string;
  origin: Origin;
  model: string;
  finishReason: TraceFinishReason;
  usage: { promptTokens: number; completionTokens: number };
  durationMs: number;
  params: {
    system?: string;
    prompt?: string;
    rawInputBytes?: number;
  };
  result: {
    text?: string;
    parsedObject?: unknown;
  };
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface TraceSink {
  emit(event: TraceEvent): Promise<void>;
}
