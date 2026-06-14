import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { LanguageModel } from "ai";
import { wrapLanguageModel } from "ai";
import { createMockLanguageModel } from "./testing/mock-model.ts";
import type { TraceSink } from "./trace.ts";
import { tracingMiddleware } from "./trace.ts";

/**
 * Connection settings for the LLM provider: OpenAI-compatible `baseUrl`,
 * `apiKey`, and the `model` id. Passed to every runner and to
 * {@link createProvider}.
 */
export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * Build an {@link AiConfig} from environment variables — `AI_BASE_URL`,
 * `AI_API_KEY` (or `OPENAI_API_KEY`), `AI_MODEL` — with OpenAI defaults.
 * Convenience for server entrypoints; consumers may construct config directly.
 */
export function resolveConfig(): AiConfig {
  return {
    baseUrl: process.env["AI_BASE_URL"] ?? "https://api.openai.com/v1",
    apiKey: process.env["AI_API_KEY"] ?? process.env["OPENAI_API_KEY"] ?? "",
    model: process.env["AI_MODEL"] ?? "gpt-4o-mini",
  };
}

/** Options for {@link createProvider}: optional trace `sinks` to wrap the model with. */
export interface ProviderOptions {
  sinks?: TraceSink[];
}

/**
 * Default `providerOptions` passed to the AI SDK. Spread this and override per
 * call (the refine runner flips `strictJsonSchema` on for structured output).
 */
export const PROVIDER_OPTIONS = {
  openai: { strictJsonSchema: false },
} as const;

/**
 * Construct a `LanguageModel` from {@link AiConfig}. When `AI_PROVIDER=mock` is
 * set, returns the synthesizing mock model (for e2e) instead of a real OpenAI
 * client. When `sinks` are supplied, wraps the model with
 * {@link tracingMiddleware} so each call emits a {@link TraceEvent}.
 *
 * Server-only: exported from `@pixelmord/content-ai-core/server` because the
 * tracing path depends on `node:async_hooks`.
 */
export function createProvider(config: AiConfig, options?: ProviderOptions): LanguageModel {
  const sinks = options?.sinks;
  const wrap = (model: LanguageModelV3): LanguageModel =>
    sinks?.length ? wrapLanguageModel({ model, middleware: tracingMiddleware(sinks) }) : model;

  if (process.env["AI_PROVIDER"] === "mock") return wrap(createMockLanguageModel());
  const openai = createOpenAI({ baseURL: config.baseUrl, apiKey: config.apiKey });
  return wrap(openai(config.model));
}
