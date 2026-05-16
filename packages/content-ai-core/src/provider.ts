import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

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
  const openai = createOpenAI({ baseURL: config.baseUrl, apiKey: config.apiKey });
  return openai(config.model);
}
