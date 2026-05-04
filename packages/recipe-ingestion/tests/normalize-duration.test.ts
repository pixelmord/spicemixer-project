import { describe, expect, test } from "vite-plus/test";
import { normalizeDuration } from "../src/normalize/duration.ts";
import type { IngestWarning } from "../src/types.ts";

function run(raw: unknown): { result: string | undefined; warnings: IngestWarning[] } {
  const warnings: IngestWarning[] = [];
  const result = normalizeDuration(raw, "prepTime", warnings);
  return { result, warnings };
}

describe("normalizeDuration — falsy inputs", () => {
  test.each([undefined, null, "", 0, false])("returns undefined for %s", (raw) => {
    const { result, warnings } = run(raw);
    expect(result).toBeUndefined();
    expect(warnings).toHaveLength(0);
  });
});

describe("normalizeDuration — ISO 8601 input", () => {
  test.each([
    ["PT30M", "PT30M"],
    ["PT1H", "PT1H"],
    ["PT1H30M", "PT1H30M"],
    ["PT90M", "PT1H30M"],
    ["PT2H", "PT2H"],
    ["P1DT0H", "PT24H"],
  ])('ISO "%s" → "%s"', (raw, expected) => {
    const { result, warnings } = run(raw);
    expect(result).toBe(expected);
    expect(warnings).toHaveLength(0);
  });

  test("ISO zero duration returns undefined", () => {
    const { result } = run("PT0M");
    expect(result).toBeUndefined();
  });
});

describe("normalizeDuration — natural language input", () => {
  test.each([
    ["30 minutes", "PT30M"],
    ["1 hour", "PT1H"],
    ["1 hour 30 minutes", "PT1H30M"],
    ["45 mins", "PT45M"],
    ["2 hours", "PT2H"],
    ["1.5 hours", "PT1H30M"],
    ["1½ hours", "PT1H30M"],
    ["10-15 minutes", "PT15M"],
    ["10 to 15 minutes", "PT15M"],
  ])('natural "%s" → "%s"', (raw, expected) => {
    const { result, warnings } = run(raw);
    expect(result).toBe(expected);
    expect(warnings).toHaveLength(0);
  });
});

describe("normalizeDuration — object input", () => {
  test('{ maxValue: "PT1H" } → "PT1H"', () => {
    const { result, warnings } = run({ maxValue: "PT1H" });
    expect(result).toBe("PT1H");
    expect(warnings).toHaveLength(0);
  });

  test('{ value: "PT45M" } → "PT45M"', () => {
    const { result } = run({ value: "PT45M" });
    expect(result).toBe("PT45M");
  });

  test("object with no recognized key → undefined, no warning", () => {
    const { result, warnings } = run({ something: "else" });
    expect(result).toBeUndefined();
    expect(warnings).toHaveLength(0);
  });
});

describe("normalizeDuration — invalid input emits warning", () => {
  test.each(["not-a-duration", "PXXX", "abc hours"])(
    'unparseable "%s" → undefined + INVALID_DURATION warning',
    (raw) => {
      const { result, warnings } = run(raw);
      expect(result).toBeUndefined();
      expect(warnings).toHaveLength(1);
      expect(warnings[0].code).toBe("INVALID_DURATION");
      expect(warnings[0].field).toBe("prepTime");
    },
  );
});
