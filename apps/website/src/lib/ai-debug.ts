import { NoObjectGeneratedError } from "ai";
import { AiError } from "@pixelmord/content-ai-core";
import type { AiErrorDetails } from "@pixelmord/content-ai-core";

/**
 * Defensive instanceof: under unit-test mocks of "ai", NoObjectGeneratedError
 * may be undefined. Guard so callers always get an AiError back instead of a
 * TypeError from `.isInstance` on undefined.
 */
function isNoObjectGeneratedError(e: unknown): e is NoObjectGeneratedError {
  try {
    return typeof NoObjectGeneratedError !== "undefined" && NoObjectGeneratedError.isInstance(e);
  } catch {
    return false;
  }
}

export interface AiDebugInfo {
  modelId?: string;
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  rawText?: string;
}

/**
 * Pull diagnostic telemetry from a successful generateText result.
 * `r` is loosely typed because the AI SDK's GenerateTextResult is heavily
 * generic; we only need a handful of fields.
 */
export function debugFromResult(r: {
  response?: { modelId?: string };
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  text?: string;
}): AiDebugInfo {
  return {
    modelId: r.response?.modelId,
    finishReason: r.finishReason,
    usage: r.usage,
    rawText: r.text,
  };
}

/**
 * Convert any thrown error into an AiError, capturing as much telemetry as
 * possible so the UI can display a useful diagnostic instead of a bare string.
 */
export function toAiError(e: unknown, fallbackMessage: string): AiError {
  if (e instanceof AiError) return e;

  if (isNoObjectGeneratedError(e)) {
    const details: AiErrorDetails = {
      rawText: e.text,
      finishReason: e.finishReason,
      modelId: e.response?.modelId,
      usage: e.usage,
      cause: e.cause instanceof Error ? e.cause.message : undefined,
    };
    return new AiError(
      "EXTRACTION_FAILED",
      `${fallbackMessage}: model output did not match the expected schema${
        details.finishReason ? ` (finishReason=${details.finishReason})` : ""
      }`,
      details,
    );
  }

  if (e instanceof Error) {
    return new AiError("EXTRACTION_FAILED", `${fallbackMessage}: ${e.message}`, {
      cause: e.message,
    });
  }
  return new AiError("EXTRACTION_FAILED", `${fallbackMessage}: ${String(e)}`);
}
