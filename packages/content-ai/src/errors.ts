export type AiErrorCode =
  | "NOT_CONFIGURED"
  | "EXTRACTION_FAILED"
  | "PDF_PARSE_FAILED"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_TYPE";

export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}
