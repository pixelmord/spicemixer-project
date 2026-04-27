export type IngestErrorCode =
  | "FETCH_FAILED"
  | "NO_JSONLD"
  | "NO_RECIPE"
  | "INVALID_RECIPE"
  | "TIMEOUT";

export class IngestError extends Error {
  readonly code: IngestErrorCode;

  constructor(
    code: IngestErrorCode,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "IngestError";
    this.code = code;
  }
}
