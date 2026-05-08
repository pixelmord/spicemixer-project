import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";
import { AiError } from "./errors.ts";
import { tracingMiddleware } from "./trace/index.ts";
import { FileTraceSink } from "./trace/sinks/file.ts";
import { SentrySpanSink } from "./trace/sinks/sentry.ts";

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function resolveConfig(): AiConfig {
  return {
    baseUrl: process.env["AI_BASE_URL"] ?? "https://api.openai.com/v1",
    apiKey: process.env["AI_API_KEY"] ?? process.env["OPENAI_API_KEY"] ?? "",
    model: process.env["AI_MODEL"] ?? "gpt-4o-mini",
  };
}

const fileSink = new FileTraceSink();
const sentrySink = new SentrySpanSink();

export function createProvider(config: AiConfig): LanguageModelV3 {
  if (!config.apiKey) {
    throw new AiError(
      "NOT_CONFIGURED",
      "AI features require AI_API_KEY to be set. For Ollama, set it to 'ollama'.",
    );
  }
  const openai = createOpenAI({ baseURL: config.baseUrl, apiKey: config.apiKey });
  const model = openai(config.model);
  return wrapLanguageModel({ model, middleware: tracingMiddleware([fileSink, sentrySink]) });
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
