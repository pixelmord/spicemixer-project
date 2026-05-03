import { describe, expect, test } from "vite-plus/test";
import { regionsForPairing } from "../../src/lib/region-derivation.ts";

describe("regionsForPairing", () => {
  test.each([
    {
      name: "both endpoints same region",
      a: ["levant"],
      b: ["levant"],
      expected: ["levant"],
    },
    {
      name: "overlapping regions are deduplicated",
      a: ["north-africa", "mediterranean"],
      b: ["mediterranean", "levant"],
      expected: ["north-africa", "mediterranean", "levant"],
    },
    {
      name: "neither endpoint has regions returns empty",
      a: [],
      b: [],
      expected: [],
    },
    {
      name: "one endpoint undefined defaults to empty",
      a: undefined,
      b: ["south-asia"],
      expected: ["south-asia"],
    },
    {
      name: "both endpoints undefined returns empty",
      a: undefined,
      b: undefined,
      expected: [],
    },
    {
      name: "disjoint regions produce union",
      a: ["north-africa"],
      b: ["east-asia"],
      expected: ["north-africa", "east-asia"],
    },
  ])("$name", ({ a, b, expected }) => {
    expect(regionsForPairing(a, b)).toEqual(expected);
  });
});
