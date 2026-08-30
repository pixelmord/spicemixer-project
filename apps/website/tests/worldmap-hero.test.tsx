// @ts-nocheck — vite-plus-test does not surface @vitest/browser type augmentations
import { render } from "vitest-browser-react";
import { describe, expect, test } from "vite-plus/test";

import { WorldmapHero } from "@/components/WorldmapHero";
import type { ResolvedDot } from "@/lib/worldmap-placement";

const labels = {
  moreRecipes: "More recipes from {region}",
  moreMixtures: "More mixtures from {region}",
};

function dots(): ResolvedDot[] {
  return [
    {
      col: 0,
      row: 0,
      regionId: "north-africa",
      item: {
        slug: "harissa",
        collection: "mixtures",
        region: ["north-africa"],
        title: "Harissa",
        description: "Spicy chili paste",
        image: null,
      },
    },
    { col: 1, row: 0, regionId: "east-asia", item: null },
  ];
}

describe("WorldmapHero", () => {
  test("a filled dot links to its item and its region-filtered list", async () => {
    const screen = await render(
      <WorldmapHero dots={dots()} cols={4} rows={2} prefix="" lang="en" labels={labels} />,
    );

    await expect
      .element(screen.getByRole("link", { name: "Harissa — North Africa" }))
      .toHaveAttribute("href", "/mixtures/harissa/");

    await expect
      .element(screen.getByRole("link", { name: "More mixtures from North Africa" }))
      .toHaveAttribute("href", "/mixtures/?region=north-africa");
  });

  test("respects the locale prefix", async () => {
    const screen = await render(
      <WorldmapHero dots={dots()} cols={4} rows={2} prefix="/de" lang="de" labels={labels} />,
    );
    await expect
      .element(screen.getByRole("link", { name: "Harissa — Nordafrika" }))
      .toHaveAttribute("href", "/de/mixtures/harissa/");
  });

  test("empty dots render no links", async () => {
    const empty: ResolvedDot[] = [{ col: 0, row: 0, regionId: "east-asia", item: null }];
    const screen = await render(
      <WorldmapHero dots={empty} cols={2} rows={1} prefix="" lang="en" labels={labels} />,
    );
    expect(screen.container.querySelectorAll("a")).toHaveLength(0);
  });
});
