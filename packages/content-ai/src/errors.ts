export type AiErrorCode =
  | "NOT_CONFIGURED"
  | "EXTRACTION_FAILED"
  | "PDF_PARSE_FAILED"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_TYPE";

export interface AiErrorDetails {
  /** Raw text returned by the model (when available — e.g. on schema validation failure). */
  rawText?: string;
  /** Provider's finish reason (stop, length, content-filter, etc). */
  finishReason?: string;
  /** Model id reported by the provider. */
  modelId?: string;
  /** Usage tokens reported by the provider. */
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  /** Underlying error message (e.g. Zod validation message). */
  cause?: string;
}

export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public readonly details?: AiErrorDetails,
  ) {
    super(message);
    this.name = "AiError";
  }
}
