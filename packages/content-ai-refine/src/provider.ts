import { createOpenAI } from "@ai-sdk/openai";
import { createMockLanguageModel } from "@pixelmord/content-ai-core/testing";
import type { LanguageModel } from "ai";

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const PROVIDER_OPTIONS = {
  openai: { strictJsonSchema: false },
} as const;

export function createProvider(config: AiConfig): LanguageModel {
  if (process.env["AI_PROVIDER"] === "mock") return createMockLanguageModel();
  const openai = createOpenAI({ baseURL: config.baseUrl, apiKey: config.apiKey });
  return openai(config.model);
}
