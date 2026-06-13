import type {
  LanguageModelV3Middleware,
  LanguageModelV3GenerateResult,
  LanguageModelV3CallOptions,
} from "@ai-sdk/provider";
import { getCurrentOrigin } from "./origin.ts";
import type { Origin } from "./origin.ts";

/** Normalized reason an LLM call ended, as recorded on a {@link TraceEvent}. */
export type TraceFinishReason =
  | "stop"
  | "length"
  | "content-filter"
  | "tool-calls"
  | "error"
  | "other"
  | "unknown";

/**
 * One fully-resolved LLM call captured by {@link tracingMiddleware}: the
 * {@link Origin} that triggered it, model, finish reason, token usage, duration,
 * and the request/response payloads. Emitted to every configured
 * {@link TraceSink} for observability (ADR 0011).
 */
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

/**
 * A destination for {@link TraceEvent}s. Implement `emit` to forward traces to
 * a file, Sentry, a store, etc. Sinks are fanned out with `Promise.allSettled`,
 * so a throwing sink never breaks the LLM call.
 */
export interface TraceSink {
  emit(event: TraceEvent): Promise<void> | void;
}

/** A fresh trace id (`crypto.randomUUID()`) for one LLM call. */
export function generateTraceId(): string {
  return crypto.randomUUID();
}

function extractParams(params: LanguageModelV3CallOptions): TraceEvent["params"] {
  const result: TraceEvent["params"] = {};
  for (const msg of params.prompt) {
    if (msg.role === "system") {
      result.system = msg.content;
    } else if (msg.role === "user") {
      let bytes = 0;
      let text = "";
      for (const part of msg.content) {
        if (part.type === "text") {
          text += part.text;
        } else if (part.type === "file" && part.data instanceof Uint8Array) {
          bytes += part.data.length;
        }
      }
      if (text) result.prompt = text;
      if (bytes) result.rawInputBytes = bytes;
    }
  }
  return result;
}

function extractText(result: LanguageModelV3GenerateResult): string | undefined {
  let text = "";
  for (const part of result.content) {
    if (part.type === "text") text += part.text;
  }
  return text || undefined;
}

async function fan(sinks: TraceSink[], event: TraceEvent): Promise<void> {
  await Promise.allSettled(sinks.map((s) => Promise.resolve(s.emit(event))));
}

/**
 * AI-SDK middleware that emits a {@link TraceEvent} to every `sink` for each
 * `generate`/`stream` call, tagged with the ambient {@link Origin}. When no
 * origin is set the call passes through untraced. Wire it via
 * {@link createProvider}'s `sinks` option rather than by hand.
 *
 * Server-only (`node:async_hooks`).
 */
export function tracingMiddleware(sinks: TraceSink[]): LanguageModelV3Middleware {
  return {
    specificationVersion: "v3",

    wrapGenerate: async ({ doGenerate, params, model }) => {
      const origin = getCurrentOrigin();
      if (!origin) return doGenerate();

      const traceId = generateTraceId();
      const at = new Date().toISOString();
      const start = Date.now();

      let result: LanguageModelV3GenerateResult;

      try {
        result = await doGenerate();
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        const event: TraceEvent = {
          traceId,
          runId: origin.runId,
          at,
          origin,
          model: model.modelId,
          finishReason: "error",
          usage: { promptTokens: 0, completionTokens: 0 },
          durationMs: Date.now() - start,
          params: extractParams(params),
          result: {},
          error: { name: e.name, message: e.message, stack: e.stack },
        };
        await fan(sinks, event);
        throw err;
      }

      const event: TraceEvent = {
        traceId,
        runId: origin.runId,
        at,
        origin,
        model: model.modelId,
        finishReason: result.finishReason.unified,
        usage: {
          promptTokens: result.usage.inputTokens.total ?? 0,
          completionTokens: result.usage.outputTokens.total ?? 0,
        },
        durationMs: Date.now() - start,
        params: extractParams(params),
        result: { text: extractText(result) },
      };
      await fan(sinks, event);
      return result;
    },

    wrapStream: async ({ doStream, params, model }) => {
      const origin = getCurrentOrigin();
      if (!origin) return doStream();

      const traceId = generateTraceId();
      const at = new Date().toISOString();
      const start = Date.now();

      let streamResult: Awaited<ReturnType<typeof doStream>>;
      try {
        streamResult = await doStream();
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        const event: TraceEvent = {
          traceId,
          runId: origin.runId,
          at,
          origin,
          model: model.modelId,
          finishReason: "error",
          usage: { promptTokens: 0, completionTokens: 0 },
          durationMs: Date.now() - start,
          params: extractParams(params),
          result: {},
          error: { name: e.name, message: e.message, stack: e.stack },
        };
        await fan(sinks, event);
        throw err;
      }

      const originalStream = streamResult.stream;
      let finishReason: TraceFinishReason = "unknown";
      let promptTokens = 0;
      let completionTokens = 0;
      const textChunks: string[] = [];

      const wrappedStream = new ReadableStream({
        start(controller) {
          const reader = originalStream.getReader();
          function pump(): void {
            reader
              .read()
              .then(({ done, value }) => {
                if (done) {
                  void fan(sinks, {
                    traceId,
                    runId: origin!.runId,
                    at,
                    origin: origin!,
                    model: model.modelId,
                    finishReason,
                    usage: { promptTokens, completionTokens },
                    durationMs: Date.now() - start,
                    params: extractParams(params),
                    result: { text: textChunks.join("") || undefined },
                  });
                  controller.close();
                  return;
                }
                if (value.type === "finish") {
                  finishReason = value.finishReason.unified;
                  promptTokens = value.usage.inputTokens.total ?? 0;
                  completionTokens = value.usage.outputTokens.total ?? 0;
                } else if (value.type === "text-delta") {
                  textChunks.push(value.delta);
                }
                controller.enqueue(value);
                pump();
              })
              .catch((err: unknown) => {
                controller.error(err);
              });
          }
          pump();
        },
      });

      return { ...streamResult, stream: wrappedStream };
    },
  };
}
