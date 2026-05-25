import { describe, expect, test } from "vite-plus/test";

import {
  filterVisibleProposals,
  pairingEndpointId,
  type PairingProposal,
  type PairingListItem,
} from "@/components/admin/forms/_shared/pairing-proposals";

describe("filterVisibleProposals", () => {
  test("returns all proposals when nothing is dismissed or featured", () => {
    const proposals: PairingProposal[] = [
      { otherCollection: "ingredients", otherSlug: "cumin", rationale: "" },
      { otherCollection: "ingredients", otherSlug: "coriander", rationale: "" },
    ];
    expect(filterVisibleProposals(proposals, new Set(), [])).toEqual(proposals);
  });

  test("excludes proposals whose slug is in the dismissed set", () => {
    const proposals: PairingProposal[] = [
      { otherCollection: "ingredients", otherSlug: "cumin", rationale: "" },
      { otherCollection: "ingredients", otherSlug: "coriander", rationale: "" },
    ];
    const result = filterVisibleProposals(proposals, new Set(["cumin"]), []);
    expect(result).toHaveLength(1);
    expect(result[0]!.otherSlug).toBe("coriander");
  });

  test("excludes proposals whose slug matches any endpoint in featured pairings", () => {
    const proposals: PairingProposal[] = [
      { otherCollection: "ingredients", otherSlug: "cumin", rationale: "" },
      { otherCollection: "ingredients", otherSlug: "coriander", rationale: "" },
    ];
    const featured: PairingListItem[] = [
      {
        id: "cardamom--cumin",
        endpoints: [
          { collection: "ingredients", slug: "cardamom" },
          { collection: "ingredients", slug: "cumin" },
        ],
        description: "",
      },
    ];
    const result = filterVisibleProposals(proposals, new Set(), featured);
    expect(result).toHaveLength(1);
    expect(result[0]!.otherSlug).toBe("coriander");
  });

  test("returns empty array when every proposal is either dismissed or featured", () => {
    const proposals: PairingProposal[] = [
      { otherCollection: "ingredients", otherSlug: "cumin", rationale: "" },
      { otherCollection: "ingredients", otherSlug: "coriander", rationale: "" },
    ];
    const featured: PairingListItem[] = [
      {
        id: "cardamom--cumin",
        endpoints: [
          { collection: "ingredients", slug: "cardamom" },
          { collection: "ingredients", slug: "cumin" },
        ],
        description: "",
      },
    ];
    const result = filterVisibleProposals(proposals, new Set(["coriander"]), featured);
    expect(result).toEqual([]);
  });
});

describe("pairingEndpointId", () => {
  test("sorts endpoints by slug and joins them with '--'", () => {
    expect(
      pairingEndpointId([
        { collection: "ingredients", slug: "cumin" },
        { collection: "ingredients", slug: "cardamom" },
      ]),
    ).toBe("cardamom--cumin");
  });

  test("is order-independent — same id for either input order", () => {
    const a = pairingEndpointId([
      { collection: "ingredients", slug: "zucchini" },
      { collection: "ingredients", slug: "apple" },
    ]);
    const b = pairingEndpointId([
      { collection: "ingredients", slug: "apple" },
      { collection: "ingredients", slug: "zucchini" },
    ]);
    expect(a).toBe(b);
    expect(a).toBe("apple--zucchini");
  });
});
