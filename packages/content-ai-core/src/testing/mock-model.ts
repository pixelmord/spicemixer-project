import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import type {
  LanguageModelV3,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";

const MOCK_USAGE: LanguageModelV3Usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

const MOCK_FINISH_REASON: LanguageModelV3FinishReason = {
  unified: "stop",
  raw: "stop",
};

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema | JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  default?: unknown;
  minItems?: number;
};

/**
 * Synthesizes a minimum-valid value from a JSON Schema. Used by the e2e mock
 * provider so AI flows produce schema-conformant payloads without a real LLM.
 *
 * Handles object/array/primitive/enum/anyOf. Not a full Ajv replacement —
 * complex `$ref`/`patternProperties` schemas fall back to `null`.
 */
export function synthesizeFromJsonSchema(schema: JsonSchema | undefined): unknown {
  if (!schema) return null;
  if ("default" in schema && schema.default !== undefined) return schema.default;
  if ("const" in schema && schema.const !== undefined) return schema.const;
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];
  if (schema.anyOf?.length) return synthesizeFromJsonSchema(schema.anyOf[0]);
  if (schema.oneOf?.length) return synthesizeFromJsonSchema(schema.oneOf[0]);
  if (schema.allOf?.length) {
    return schema.allOf.reduce<Record<string, unknown>>((acc, sub) => {
      const v = synthesizeFromJsonSchema(sub);
      return v && typeof v === "object" && !Array.isArray(v)
        ? { ...acc, ...(v as Record<string, unknown>) }
        : acc;
    }, {});
  }

  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  if (type === "object" || (!type && schema.properties)) {
    const out: Record<string, unknown> = {};
    const props = schema.properties ?? {};
    const required = schema.required ?? Object.keys(props);
    for (const key of required) {
      if (props[key]) out[key] = synthesizeFromJsonSchema(props[key]);
    }
    return out;
  }

  if (type === "array") {
    const itemSchema = Array.isArray(schema.items) ? schema.items[0] : schema.items;
    const minItems = schema.minItems ?? 0;
    if (minItems === 0) return [];
    const item = synthesizeFromJsonSchema(itemSchema);
    return Array.from({ length: minItems }, () => item);
  }

  if (type === "string") return "e2e-mock";
  if (type === "number" || type === "integer") return 0;
  if (type === "boolean") return false;
  if (type === "null") return null;

  return null;
}

function extractSchema(options: unknown): JsonSchema | undefined {
  const opts = options as { responseFormat?: { type?: string; schema?: JsonSchema } };
  if (opts.responseFormat?.type === "json" && opts.responseFormat.schema) {
    return opts.responseFormat.schema;
  }
  return undefined;
}

/**
 * Returns a `LanguageModelV3` that mimics OpenAI structured-output responses
 * by synthesizing minimum-valid JSON from the call's `responseFormat.schema`.
 *
 * Activated by setting `AI_PROVIDER=mock` in the four content-ai providers.
 * Used exclusively by the website e2e suite — never wire it into prod paths.
 */
export function createMockLanguageModel(): LanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async (options): Promise<LanguageModelV3GenerateResult> => {
      const schema = extractSchema(options);
      const value = schema ? synthesizeFromJsonSchema(schema) : { e2eMock: true };
      const text = JSON.stringify(value);
      return {
        content: [{ type: "text", text }],
        finishReason: MOCK_FINISH_REASON,
        usage: MOCK_USAGE,
        warnings: [],
      };
    },
    doStream: async (options): Promise<LanguageModelV3StreamResult> => {
      const schema = extractSchema(options);
      const value = schema ? synthesizeFromJsonSchema(schema) : { e2eMock: true };
      const text = JSON.stringify(value);
      const chunks: LanguageModelV3StreamPart[] = [
        { type: "text-start" as const, id: "text-1" },
        { type: "text-delta" as const, id: "text-1", delta: text },
        { type: "text-end" as const, id: "text-1" },
        { type: "finish" as const, finishReason: MOCK_FINISH_REASON, usage: MOCK_USAGE },
      ];
      return { stream: simulateReadableStream({ chunks }) };
    },
  });
}
