import { describe, expect, test } from "vite-plus/test";
import { commonPresets, excludeExistingValuesRule } from "../../src/contracts/_shared.ts";

describe("excludeExistingValuesRule", () => {
  test("returns empty string when there are no existing values", () => {
    expect(excludeExistingValuesRule(undefined)).toBe("");
    expect(excludeExistingValuesRule([])).toBe("");
  });

  test("lists the existing values and forbids echoing them back", () => {
    const rule = excludeExistingValuesRule(["cumin", "paprika"]);
    expect(rule).toContain("cumin, paprika");
    expect(rule).toContain("MUST NOT");
    expect(rule).toContain("genuinely new values");
  });
});

describe("commonPresets", () => {
  test("exposes the expand and summarize presets that never auto-apply", () => {
    const byId = Object.fromEntries(commonPresets.map((p) => [p.id, p]));
    expect(Object.keys(byId).sort()).toEqual(["expand", "summarize"]);
    for (const preset of commonPresets) {
      expect(preset.appliesTo).toBe("text");
      expect(preset.autoApplyOverride).toEqual({ policy: "never" });
    }
  });
});
