import { createOpenAI } from "@ai-sdk/openai";
import { createMockLanguageModel } from "@pixelmord/content-ai-core/testing";
import type { ProviderOptions } from "@pixelmord/content-ai-core";
import { tracingMiddleware } from "@pixelmord/content-ai-core/server";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { LanguageModel } from "ai";
import { wrapLanguageModel } from "ai";

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const PROVIDER_OPTIONS = {
  openai: { strictJsonSchema: false },
} as const;

export function createProvider(config: AiConfig, options?: ProviderOptions): LanguageModel {
  const sinks = options?.sinks;
  const wrap = (model: LanguageModelV3): LanguageModel =>
    sinks?.length ? wrapLanguageModel({ model, middleware: tracingMiddleware(sinks) }) : model;

  if (process.env["AI_PROVIDER"] === "mock") return wrap(createMockLanguageModel());
  const openai = createOpenAI({ baseURL: config.baseUrl, apiKey: config.apiKey });
  return wrap(openai(config.model));
}
