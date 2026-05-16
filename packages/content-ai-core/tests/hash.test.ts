import { describe, expect, test } from "vite-plus/test";
import { fingerprintHash, normalizePayload } from "../src/hash.ts";

describe("normalizePayload", () => {
  test("trims and lowercases strings", () => {
    expect(normalizePayload("  Hello World  ")).toBe("hello world");
  });

  test("returns consistent JSON for arrays", () => {
    expect(normalizePayload(["b", "a"])).toBe(JSON.stringify(["b", "a"]));
  });

  test("sorts object keys before serialising", () => {
    const a = normalizePayload({ z: 1, a: 2 });
    const b = normalizePayload({ a: 2, z: 1 });
    expect(a).toBe(b);
  });

  test("handles null and primitives", () => {
    expect(normalizePayload(null)).toBe("null");
    expect(normalizePayload(42)).toBe("42");
    expect(normalizePayload(true)).toBe("true");
  });
});

describe("fingerprintHash — determinism", () => {
  test("same input produces same hash", () => {
    expect(fingerprintHash("basil")).toBe(fingerprintHash("basil"));
  });

  test("different inputs produce different hashes", () => {
    expect(fingerprintHash("basil")).not.toBe(fingerprintHash("cumin"));
  });

  test("hash is exactly 12 hex characters", () => {
    expect(fingerprintHash("anything")).toMatch(/^[0-9a-f]{12}$/);
  });

  test("normalises before hashing — whitespace and case collapsed", () => {
    expect(fingerprintHash("Basil")).toBe(fingerprintHash("basil"));
    expect(fingerprintHash("  basil  ")).toBe(fingerprintHash("basil"));
  });

  test("object and key-reordered object hash the same", () => {
    expect(fingerprintHash({ a: 1, b: 2 })).toBe(fingerprintHash({ b: 2, a: 1 }));
  });
});
