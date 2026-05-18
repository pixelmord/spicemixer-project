import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createMockLanguageModel } from "@pixelmord/content-ai-core/testing";
import { wrapLanguageModel } from "ai";
import { AiError } from "./errors.ts";
import { tracingMiddleware } from "./trace/index.ts";
import { FileTraceSink } from "./trace/sinks/file.ts";
import { SentrySpanSink } from "./trace/sinks/sentry.ts";
import { PubSubTraceSink } from "./trace/sinks/pubsub.ts";

export { resolveConfig } from "@pixelmord/content-ai-core";
export type { AiConfig } from "@pixelmord/content-ai-core";

const fileSink = new FileTraceSink();
const sentrySink = new SentrySpanSink();
const pubSubSink = new PubSubTraceSink();

export function createProvider(
  config: import("@pixelmord/content-ai-core").AiConfig,
): LanguageModelV3 {
  if (process.env["AI_PROVIDER"] === "mock") {
    return wrapLanguageModel({
      model: createMockLanguageModel(),
      middleware: tracingMiddleware([fileSink, sentrySink, pubSubSink]),
    });
  }
  if (!config.apiKey) {
    throw new AiError(
      "NOT_CONFIGURED",
      "AI features require AI_API_KEY to be set. For Ollama, set it to 'ollama'.",
    );
  }
  const openai = createOpenAI({ baseURL: config.baseUrl, apiKey: config.apiKey });
  const model = openai(config.model);
  return wrapLanguageModel({
    model,
    middleware: tracingMiddleware([fileSink, sentrySink, pubSubSink]),
  });
}

/**
 * OpenAI's strict structured outputs require every schema property to appear
 * in the `required` array, which conflicts with `z.optional()`. Disabling
 * strict mode lets the schema use optional fields naturally. Ignored by
 * non-OpenAI providers (Ollama, llama-cpp).
 */
export const PROVIDER_OPTIONS = {
  openai: { strictJsonSchema: false },
} as const;
