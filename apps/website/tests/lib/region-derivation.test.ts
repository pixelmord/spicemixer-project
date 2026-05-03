import { describe, expect, test } from "vite-plus/test";
import { regionsForPairing } from "../../src/lib/region-derivation.ts";

describe("regionsForPairing", () => {
  test.each([
    {
      name: "both endpoints same region",
      a: { region: ["levant"] },
      b: { region: ["levant"] },
      expected: ["levant"],
    },
    {
      name: "overlapping regions are deduplicated",
      a: { region: ["north-africa", "mediterranean"] },
      b: { region: ["mediterranean", "levant"] },
      expected: ["north-africa", "mediterranean", "levant"],
    },
    {
      name: "neither endpoint has regions returns empty",
      a: { region: [] },
      b: { region: [] },
      expected: [],
    },
    {
      name: "one endpoint missing region field defaults to empty",
      a: {},
      b: { region: ["south-asia"] },
      expected: ["south-asia"],
    },
    {
      name: "both endpoints missing region field returns empty",
      a: {},
      b: {},
      expected: [],
    },
    {
      name: "disjoint regions produce union",
      a: { region: ["north-africa"] },
      b: { region: ["east-asia"] },
      expected: ["north-africa", "east-asia"],
    },
  ])("$name", ({ a, b, expected }) => {
    expect(regionsForPairing(a, b)).toEqual(expected);
  });
});
