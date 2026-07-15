import { describe, expect, test } from "vite-plus/test";
import {
  assignItemsToDots,
  orderItems,
  type PlacementItem,
} from "../src/lib/worldmap-placement.ts";
import type { WorldmapDot } from "../src/lib/worldmap-generate.ts";

function dot(col: number, row: number, regionId: WorldmapDot["regionId"]): WorldmapDot {
  return { col, row, regionId };
}

// Small synthetic matrix: 3 dots in north-africa, 2 in east-asia.
const DOTS: WorldmapDot[] = [
  dot(0, 0, "north-africa"),
  dot(1, 0, "north-africa"),
  dot(2, 0, "north-africa"),
  dot(0, 1, "east-asia"),
  dot(1, 1, "east-asia"),
];

function item(
  over: Partial<PlacementItem> & Pick<PlacementItem, "slug" | "collection" | "region">,
): PlacementItem {
  return { title: over.slug, description: "", image: null, ...over };
}

const ITEMS: PlacementItem[] = [
  item({
    slug: "harissa",
    collection: "mixtures",
    region: ["north-africa"],
    datePublished: "2026-04-18",
  }),
  item({
    slug: "ras-el-hanout",
    collection: "mixtures",
    region: ["north-africa"],
    datePublished: "2026-05-01",
  }),
  item({
    slug: "couscous",
    collection: "recipes",
    region: ["north-africa"],
    datePublished: "2026-05-25",
  }),
  item({
    slug: "ramen",
    collection: "recipes",
    region: ["east-asia"],
    datePublished: "2026-03-01",
  }),
];

describe("orderItems", () => {
  test("puts mixtures before recipes", () => {
    const ordered = orderItems(ITEMS);
    const firstRecipe = ordered.findIndex((i) => i.collection === "recipes");
    const lastMixture = ordered.map((i) => i.collection).lastIndexOf("mixtures");
    expect(lastMixture).toBeLessThan(firstRecipe);
  });

  test("orders by datePublished desc within a collection", () => {
    const ordered = orderItems(ITEMS).filter((i) => i.collection === "mixtures");
    expect(ordered.map((i) => i.slug)).toEqual(["ras-el-hanout", "harissa"]);
  });

  test("does not mutate the input", () => {
    const copy = [...ITEMS];
    orderItems(ITEMS);
    expect(ITEMS).toEqual(copy);
  });
});

describe("assignItemsToDots", () => {
  test("returns every land dot", () => {
    expect(assignItemsToDots(ITEMS, DOTS)).toHaveLength(DOTS.length);
  });

  test("is deterministic across runs", () => {
    const a = assignItemsToDots(ITEMS, DOTS);
    const b = assignItemsToDots(ITEMS, DOTS);
    expect(a.map((d) => d.item?.slug ?? null)).toEqual(b.map((d) => d.item?.slug ?? null));
  });

  test("places each item only within one of its regions", () => {
    for (const d of assignItemsToDots(ITEMS, DOTS)) {
      if (d.item) expect(d.item.region).toContain(d.regionId);
    }
  });

  test("assigns each item to at most one dot", () => {
    const resolved = assignItemsToDots(ITEMS, DOTS);
    const slugs = resolved.map((d) => d.item?.slug).filter(Boolean);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test("places all items when capacity allows", () => {
    const filled = assignItemsToDots(ITEMS, DOTS).filter((d) => d.item).length;
    expect(filled).toBe(ITEMS.length);
  });

  test("drops items whose region is full (graceful overflow)", () => {
    // 4 north-africa items but only 3 north-africa dots → one dropped.
    const many: PlacementItem[] = ["a", "b", "c", "d"].map((s) =>
      item({ slug: s, collection: "mixtures", region: ["north-africa"] }),
    );
    const filled = assignItemsToDots(many, DOTS).filter((d) => d.item).length;
    expect(filled).toBe(3);
  });

  test("leaves regions with no items entirely empty", () => {
    const resolved = assignItemsToDots(
      [item({ slug: "ramen", collection: "recipes", region: ["east-asia"] })],
      DOTS,
    );
    const naFilled = resolved.filter((d) => d.regionId === "north-africa" && d.item);
    expect(naFilled).toHaveLength(0);
  });
});
