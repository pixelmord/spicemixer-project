import { describe, expect, test } from "vite-plus/test";
import { AiError } from "../src/errors.ts";

describe("AiError", () => {
  test("is an instance of Error", () => {
    const err = new AiError("NOT_CONFIGURED", "missing key");
    expect(err).toBeInstanceOf(Error);
  });

  test("name is AiError", () => {
    expect(new AiError("NOT_CONFIGURED", "x").name).toBe("AiError");
  });

  test("code is accessible", () => {
    const err = new AiError("EXTRACTION_FAILED", "boom");
    expect(err.code).toBe("EXTRACTION_FAILED");
  });

  test("message is set", () => {
    expect(new AiError("PDF_PARSE_FAILED", "bad pdf").message).toBe("bad pdf");
  });

  test("details are accessible when provided", () => {
    const err = new AiError("EXTRACTION_FAILED", "x", { rawText: "raw", modelId: "gpt-4" });
    expect(err.details?.rawText).toBe("raw");
    expect(err.details?.modelId).toBe("gpt-4");
  });

  test("details are undefined when not provided", () => {
    expect(new AiError("NOT_CONFIGURED", "x").details).toBeUndefined();
  });
});
