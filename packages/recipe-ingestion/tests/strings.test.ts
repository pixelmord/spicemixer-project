import { describe, expect, test } from "vite-plus/test";
import { normalizeString } from "../src/util/strings.ts";

describe("normalizeString", () => {
  test("trims leading and trailing whitespace", () => {
    expect(normalizeString("  hello  ")).toBe("hello");
  });

  test("collapses internal whitespace", () => {
    expect(normalizeString("too   many   spaces")).toBe("too many spaces");
  });

  test("decodes named HTML entities", () => {
    expect(normalizeString("salt &amp; pepper")).toBe("salt & pepper");
    expect(normalizeString("&lt;em&gt;bold&lt;/em&gt;")).toBe("bold");
  });

  test("decodes numeric HTML entities", () => {
    expect(normalizeString("&#65;")).toBe("A");
    expect(normalizeString("&#x41;")).toBe("A");
  });

  test("strips HTML tags", () => {
    expect(normalizeString("<strong>Stir</strong> until combined")).toBe("Stir until combined");
  });

  test("replaces non-breaking spaces", () => {
    expect(normalizeString("hello\u00a0world")).toBe("hello world");
  });

  test("removes zero-width spaces", () => {
    expect(normalizeString("hel\u200blo")).toBe("hello");
  });

  test("normalizes double parentheses", () => {
    expect(normalizeString("heat ((gently))")).toBe("heat (gently)");
  });

  test("handles empty string", () => {
    expect(normalizeString("")).toBe("");
  });
});
