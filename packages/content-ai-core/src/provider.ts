import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { createMockLanguageModel } from "./testing/mock-model.ts";

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const PROVIDER_OPTIONS = {
  openai: { strictJsonSchema: false },
} as const;

// Returns a bare language model. Consumers that need tracing middleware
// (Spicemixer's FileTraceSink / SentrySpanSink) wrap the returned model
// themselves via wrapLanguageModel from the 'ai' package.
export function createProvider(config: AiConfig): LanguageModel {
  if (process.env["AI_PROVIDER"] === "mock") return createMockLanguageModel();
  const openai = createOpenAI({ baseURL: config.baseUrl, apiKey: config.apiKey });
  return openai(config.model);
}
