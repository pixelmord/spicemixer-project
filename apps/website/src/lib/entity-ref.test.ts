import { describe, expect, test } from "vite-plus/test";
import { entityRefSchema, parse, format, equal, inverseLookup } from "./entity-ref.ts";
import type { EntityRef } from "./entity-ref.ts";

describe("entityRefSchema", () => {
  test.each([
    { collection: "ingredients", slug: "caraway" },
    { collection: "mixtures", slug: "harissa" },
    { collection: "ingredients", slug: "black-pepper" },
    { collection: "mixtures", slug: "ras-el-hanout" },
  ])("accepts valid ref $collection:$slug", (input) => {
    const ref = entityRefSchema.parse(input);
    expect(ref.collection).toBe(input.collection);
    expect(ref.slug).toBe(input.slug);
  });

  test("rejects all invalid inputs", () => {
    const invalidInputs: unknown[] = [
      { collection: "recipes", slug: "cookies" },
      { collection: "spicemixes", slug: "berbere" },
      { collection: "sauces", slug: "harissa" },
      { collection: "ingredients", slug: "" },
      { collection: "ingredients" },
      { slug: "caraway" },
      null,
      "ingredients:caraway",
      42,
    ];
    for (const input of invalidInputs) {
      expect(() => entityRefSchema.parse(input)).toThrow();
    }
  });
});

describe("parse", () => {
  test.each([
    { collection: "ingredients", slug: "caraway" },
    { collection: "mixtures", slug: "harissa" },
  ] as const)("returns EntityRef for valid input $collection:$slug", (input) => {
    const ref = parse(input);
    expect(ref).toEqual(input);
  });

  test("throws for all invalid inputs", () => {
    const invalidInputs: unknown[] = [
      { collection: "recipes", slug: "foo" },
      { collection: "ingredients", slug: "" },
      null,
    ];
    for (const input of invalidInputs) {
      expect(() => parse(input)).toThrow();
    }
  });
});

describe("format", () => {
  test.each([
    [{ collection: "ingredients", slug: "caraway" }, "ingredients:caraway"],
    [{ collection: "mixtures", slug: "harissa" }, "mixtures:harissa"],
    [{ collection: "mixtures", slug: "ras-el-hanout" }, "mixtures:ras-el-hanout"],
  ])("formats %j as %s", (ref, expected) => {
    expect(format(ref as EntityRef)).toBe(expected);
  });
});

describe("equal", () => {
  test.each([
    [
      { collection: "ingredients", slug: "caraway" },
      { collection: "ingredients", slug: "caraway" },
      true,
    ],
    [
      { collection: "mixtures", slug: "harissa" },
      { collection: "mixtures", slug: "harissa" },
      true,
    ],
    [
      { collection: "ingredients", slug: "caraway" },
      { collection: "mixtures", slug: "caraway" },
      false,
    ],
    [
      { collection: "ingredients", slug: "caraway" },
      { collection: "ingredients", slug: "cumin" },
      false,
    ],
    [
      { collection: "ingredients", slug: "caraway" },
      { collection: "mixtures", slug: "harissa" },
      false,
    ],
  ])("equal(%j, %j) => %s", (a, b, expected) => {
    expect(equal(a as EntityRef, b as EntityRef)).toBe(expected);
  });
});

describe("inverseLookup", () => {
  const allRefs: EntityRef[] = [
    { collection: "ingredients", slug: "harissa" },
    { collection: "mixtures", slug: "harissa" },
    { collection: "ingredients", slug: "caraway" },
    { collection: "mixtures", slug: "ras-el-hanout" },
    { collection: "ingredients", slug: "cumin" },
  ];

  test("returns refs in the other collection with the same slug", () => {
    const result = inverseLookup({ collection: "ingredients", slug: "harissa" }, allRefs);
    expect(result).toEqual([{ collection: "mixtures", slug: "harissa" }]);
  });

  test("works from mixtures side too", () => {
    const result = inverseLookup({ collection: "mixtures", slug: "harissa" }, allRefs);
    expect(result).toEqual([{ collection: "ingredients", slug: "harissa" }]);
  });

  test("returns empty array when no cross-collection match exists", () => {
    const result = inverseLookup({ collection: "ingredients", slug: "caraway" }, allRefs);
    expect(result).toEqual([]);
  });

  test("returns empty array when allRefs is empty", () => {
    const result = inverseLookup({ collection: "ingredients", slug: "harissa" }, []);
    expect(result).toEqual([]);
  });

  test("does not return same-collection refs", () => {
    const refs: EntityRef[] = [
      { collection: "ingredients", slug: "caraway" },
      { collection: "ingredients", slug: "caraway" },
    ];
    const result = inverseLookup({ collection: "ingredients", slug: "caraway" }, refs);
    expect(result).toEqual([]);
  });

  test("returns multiple matches when they exist", () => {
    const refs: EntityRef[] = [
      { collection: "mixtures", slug: "cumin" },
      { collection: "mixtures", slug: "cumin" },
      { collection: "ingredients", slug: "cumin" },
    ];
    const result = inverseLookup({ collection: "ingredients", slug: "cumin" }, refs);
    expect(result).toHaveLength(2);
    expect(result).toEqual([
      { collection: "mixtures", slug: "cumin" },
      { collection: "mixtures", slug: "cumin" },
    ]);
  });
});
