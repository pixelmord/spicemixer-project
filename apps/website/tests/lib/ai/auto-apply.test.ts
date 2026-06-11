import { describe, expect, test } from "vite-plus/test";
import { planLinkAutoApply, planPairingAutoApply } from "../../../src/lib/ai/auto-apply.ts";

describe("planLinkAutoApply", () => {
  test("includes a high-confidence link whose pattern is not already present", () => {
    const plan = planLinkAutoApply(
      [{ pattern: "miso", slug: "miso", confidence: "high" }],
      new Set<string>(),
    );
    expect(plan).toEqual([{ pattern: "miso", slug: "miso", confidence: "high" }]);
  });

  test("excludes a low-confidence link", () => {
    const plan = planLinkAutoApply(
      [{ pattern: "miso", slug: "miso", confidence: "low" }],
      new Set<string>(),
    );
    expect(plan).toEqual([]);
  });

  test("excludes a link whose pattern is already present", () => {
    const plan = planLinkAutoApply(
      [{ pattern: "miso", slug: "miso", confidence: "high" }],
      new Set(["miso"]),
    );
    expect(plan).toEqual([]);
  });
});

describe("planPairingAutoApply", () => {
  test("includes a high-confidence pairing with a sorted canonical id", () => {
    const plan = planPairingAutoApply(
      "cardamom",
      "ingredients",
      [
        {
          otherCollection: "ingredients",
          otherSlug: "cumin",
          rationale: "Warm pair",
          confidence: "high",
        },
      ],
      new Set<string>(),
    );
    expect(plan).toEqual([
      {
        id: "cardamom--cumin",
        endpoints: [
          { collection: "ingredients", slug: "cardamom" },
          { collection: "ingredients", slug: "cumin" },
        ],
        rationale: "Warm pair",
        confidence: "high",
        otherSlug: "cumin",
      },
    ]);
  });

  test("excludes a low-confidence pairing", () => {
    const plan = planPairingAutoApply(
      "cardamom",
      "ingredients",
      [
        {
          otherCollection: "ingredients",
          otherSlug: "cumin",
          rationale: "Weak",
          confidence: "low",
        },
      ],
      new Set<string>(),
    );
    expect(plan).toEqual([]);
  });

  test("excludes a pairing whose canonical id already exists", () => {
    const plan = planPairingAutoApply(
      "cardamom",
      "ingredients",
      [
        {
          otherCollection: "ingredients",
          otherSlug: "cumin",
          rationale: "Warm",
          confidence: "high",
        },
      ],
      new Set(["cardamom--cumin"]),
    );
    expect(plan).toEqual([]);
  });
});
