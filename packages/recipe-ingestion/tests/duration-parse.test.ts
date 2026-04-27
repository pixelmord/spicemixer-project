import { describe, expect, test } from "vite-plus/test";
import { parseDuration } from "../src/util/duration-parse.ts";

describe("parseDuration", () => {
  test("passes through ISO 8601 PT strings", () => {
    expect(parseDuration("PT30M")).toBe("PT30M");
    expect(parseDuration("PT1H")).toBe("PT1H");
    expect(parseDuration("PT1H30M")).toBe("PT1H30M");
  });

  test("normalizes ISO with seconds to minutes", () => {
    expect(parseDuration("PT90S")).toBe("PT2M");
  });

  test("parses natural language — minutes", () => {
    expect(parseDuration("30 minutes")).toBe("PT30M");
    expect(parseDuration("45 mins")).toBe("PT45M");
  });

  test("parses natural language — hours", () => {
    expect(parseDuration("2 hours")).toBe("PT2H");
    expect(parseDuration("1 hr")).toBe("PT1H");
  });

  test("parses natural language — hours and minutes", () => {
    expect(parseDuration("1 hour 30 minutes")).toBe("PT1H30M");
  });

  test("parses decimal hours", () => {
    expect(parseDuration("1.5 hours")).toBe("PT1H30M");
  });

  test("parses unicode fractions", () => {
    expect(parseDuration("1½ hours")).toBe("PT1H30M");
  });

  test("collapses ranges to upper bound", () => {
    expect(parseDuration("10-15 minutes")).toBe("PT15M");
    expect(parseDuration("1-2 hours")).toBe("PT2H");
  });

  test("returns null for unparseable input", () => {
    expect(parseDuration("a while")).toBeNull();
    expect(parseDuration("")).toBeNull();
    expect(parseDuration(null)).toBeNull();
    expect(parseDuration(undefined)).toBeNull();
  });
});
