// @ts-nocheck — vite-plus-test does not surface @vitest/browser type augmentations
import { useState } from "react";
import { render } from "vitest-browser-react";
import { describe, expect, test, vi } from "vite-plus/test";

vi.mock("./CreatePairingDialog.tsx", () => ({}));

import { PairingsSection } from "@/components/admin/forms/_shared/PairingsSection";
import type {
  PairingProposal,
  PairingListItem,
} from "@/components/admin/forms/_shared/pairing-proposals";

const baseProps = {
  entityKind: "ingredient" as const,
  slug: "cardamom",
  locale: "en" as const,
  isNew: false,
  aiEventLog: { read: async () => [], append: async () => {} },
  runIdSeed: "test-run",
  onCreatePairing: async () => ({ kind: "pairing", id: "x" }),
};

describe("PairingsSection", () => {
  test("renders an empty-state hint when there are no proposals and no featured pairings", async () => {
    const screen = await render(
      <PairingsSection
        {...baseProps}
        proposals={[]}
        setProposals={() => {}}
        dismissed={new Set()}
        setDismissed={() => {}}
        featuredPairings={[]}
        setFeaturedPairings={() => {}}
      />,
    );
    await expect.element(screen.getByText(/no pairings yet/i)).toBeVisible();
  });

  test("renders proposals with count and per-row Add/Dismiss buttons", async () => {
    const proposals: PairingProposal[] = [
      { otherCollection: "ingredients", otherSlug: "cumin", rationale: "shared earthiness" },
      { otherCollection: "ingredients", otherSlug: "coriander", rationale: "citrus contrast" },
    ];
    const screen = await render(
      <PairingsSection
        {...baseProps}
        proposals={proposals}
        setProposals={() => {}}
        dismissed={new Set()}
        setDismissed={() => {}}
        featuredPairings={[]}
      />,
    );
    await expect
      .element(screen.getByTestId("pairings-proposal-count"))
      .toHaveTextContent("2 AI suggestions");
    await expect.element(screen.getByRole("button", { name: "Add pairing cumin" })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Dismiss pairing cumin" }))
      .toBeVisible();
  });

  test("renders a confidence badge per proposal that has a confidence value", async () => {
    const proposals: PairingProposal[] = [
      {
        otherCollection: "ingredients",
        otherSlug: "cumin",
        rationale: "shared earthiness",
        confidence: "high",
      },
    ];
    const screen = await render(
      <PairingsSection
        {...baseProps}
        proposals={proposals}
        setProposals={() => {}}
        dismissed={new Set()}
        setDismissed={() => {}}
        featuredPairings={[]}
      />,
    );
    await expect.element(screen.getByLabelText("high confidence")).toBeVisible();
  });

  test("dismissing a proposal calls setDismissed with the slug added", async () => {
    const setDismissed = vi.fn();
    const proposals: PairingProposal[] = [
      { otherCollection: "ingredients", otherSlug: "cumin", rationale: "" },
    ];
    const screen = await render(
      <PairingsSection
        {...baseProps}
        proposals={proposals}
        setProposals={() => {}}
        dismissed={new Set()}
        setDismissed={setDismissed}
        featuredPairings={[]}
      />,
    );
    await screen.getByRole("button", { name: "Dismiss pairing cumin" }).click();
    const next = setDismissed.mock.calls[0]?.[0] as Set<string>;
    expect(next.has("cumin")).toBe(true);
  });

  test("hides proposals that are already in the dismissed set", async () => {
    const proposals: PairingProposal[] = [
      { otherCollection: "ingredients", otherSlug: "cumin", rationale: "" },
      { otherCollection: "ingredients", otherSlug: "coriander", rationale: "" },
    ];
    const screen = await render(
      <PairingsSection
        {...baseProps}
        proposals={proposals}
        setProposals={() => {}}
        dismissed={new Set(["cumin"])}
        setDismissed={() => {}}
        featuredPairings={[]}
      />,
    );
    await expect
      .element(screen.getByTestId("pairings-proposal-count"))
      .toHaveTextContent("1 AI suggestion");
    expect(screen.getByRole("button", { name: "Add pairing cumin" }).elements().length).toBe(0);
    await expect
      .element(screen.getByRole("button", { name: "Add pairing coriander" }))
      .toBeVisible();
  });

  test("renders featured pairings with edit links", async () => {
    const featured: PairingListItem[] = [
      {
        id: "cardamom--cinnamon",
        endpoints: [
          { collection: "ingredients", slug: "cardamom" },
          { collection: "ingredients", slug: "cinnamon" },
        ],
        description: "warm baking",
      },
    ];
    const screen = await render(
      <PairingsSection
        {...baseProps}
        proposals={[]}
        setProposals={() => {}}
        dismissed={new Set()}
        setDismissed={() => {}}
        featuredPairings={featured}
      />,
    );
    await expect.element(screen.getByText("cardamom--cinnamon")).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Edit" }))
      .toHaveAttribute("href", "/admin/pairings/cardamom--cinnamon/edit?locale=en");
  });

  test("Suggest pairings button renders when onSuggestPairings is provided and not isNew", async () => {
    const screen = await render(
      <PairingsSection
        {...baseProps}
        proposals={[]}
        setProposals={() => {}}
        dismissed={new Set()}
        setDismissed={() => {}}
        featuredPairings={[]}
        onSuggestPairings={async () => []}
      />,
    );
    await expect.element(screen.getByRole("button", { name: /suggest pairings/i })).toBeVisible();
  });

  test("Suggest pairings button is hidden when isNew=true", async () => {
    const screen = await render(
      <PairingsSection
        {...baseProps}
        isNew
        proposals={[]}
        setProposals={() => {}}
        dismissed={new Set()}
        setDismissed={() => {}}
        featuredPairings={[]}
        onSuggestPairings={async () => []}
      />,
    );
    expect(screen.getByRole("button", { name: /suggest pairings/i }).elements().length).toBe(0);
  });

  test("Suggest pairings button is hidden when no onSuggestPairings callback is given", async () => {
    const screen = await render(
      <PairingsSection
        {...baseProps}
        proposals={[]}
        setProposals={() => {}}
        dismissed={new Set()}
        setDismissed={() => {}}
        featuredPairings={[]}
      />,
    );
    expect(screen.getByRole("button", { name: /suggest pairings/i }).elements().length).toBe(0);
  });

  test("clicking Suggest pairings invokes the callback and merges new proposals (no duplicates)", async () => {
    function Harness() {
      const [proposals, setProposals] = useState<PairingProposal[]>([
        { otherCollection: "ingredients", otherSlug: "cumin", rationale: "" },
      ]);
      return (
        <>
          <PairingsSection
            {...baseProps}
            proposals={proposals}
            setProposals={setProposals}
            dismissed={new Set()}
            setDismissed={() => {}}
            featuredPairings={[]}
            onSuggestPairings={async () => [
              { otherCollection: "ingredients", otherSlug: "cumin", rationale: "" },
              { otherCollection: "ingredients", otherSlug: "fennel", rationale: "" },
            ]}
          />
          <span data-testid="proposal-slugs">{proposals.map((p) => p.otherSlug).join(",")}</span>
        </>
      );
    }
    const screen = await render(<Harness />);
    await screen.getByRole("button", { name: /suggest pairings/i }).click();
    await expect.element(screen.getByTestId("proposal-slugs")).toHaveTextContent("cumin,fennel");
  });
});
