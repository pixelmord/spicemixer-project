import { expect, test } from "vite-plus/test";
import { hasLiabilityScope } from "./liability.ts";

type Input = Parameters<typeof hasLiabilityScope>[0];

const cases: [string, Input, boolean][] = [
  ["empty object", {}, false],
  [
    "all undefined",
    { medicinalUses: undefined, healthBenefits: undefined, safetyNotes: undefined },
    false,
  ],
  ["whitespace-only medicinalUses", { medicinalUses: "   " }, false],
  ["whitespace-only healthBenefits", { healthBenefits: "\t\n" }, false],
  ["whitespace-only safetyNotes", { safetyNotes: "  " }, false],
  [
    "all three whitespace-only",
    { medicinalUses: "  ", healthBenefits: "  ", safetyNotes: "  " },
    false,
  ],
  ["medicinalUses non-empty", { medicinalUses: "Used as anti-inflammatory" }, true],
  ["healthBenefits non-empty", { healthBenefits: "Rich in antioxidants" }, true],
  ["safetyNotes non-empty", { safetyNotes: "May cause allergic reactions" }, true],
  [
    "multiple sections non-empty",
    { medicinalUses: "anti-inflammatory", healthBenefits: "antioxidants" },
    true,
  ],
  [
    "one non-empty among three",
    { medicinalUses: "", healthBenefits: "", safetyNotes: "handle with gloves" },
    true,
  ],
];

for (const [name, input, expected] of cases) {
  test(name, () => {
    expect(hasLiabilityScope(input)).toBe(expected);
  });
}
