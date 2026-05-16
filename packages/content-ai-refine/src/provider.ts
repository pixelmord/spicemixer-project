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

export function createProvider(config: AiConfig): LanguageModel {
  const openai = createOpenAI({ baseURL: config.baseUrl, apiKey: config.apiKey });
  return openai(config.model);
}
