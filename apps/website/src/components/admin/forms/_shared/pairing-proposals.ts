export type PairingProposal = {
  otherCollection: "ingredients" | "mixtures" | "recipes";
  otherSlug: string;
  rationale: string;
  traceId?: string;
};

export type PairingEndpoint = {
  collection: string;
  slug: string;
};

export type PairingListItem = {
  id: string;
  endpoints: [PairingEndpoint, PairingEndpoint];
  description: string;
};

export function filterVisibleProposals(
  proposals: PairingProposal[],
  dismissed: Set<string>,
  featured: PairingListItem[],
): PairingProposal[] {
  return proposals.filter(
    (p) =>
      !dismissed.has(p.otherSlug) &&
      !featured.some((fp) => fp.endpoints.some((ep) => ep.slug === p.otherSlug)),
  );
}

export function pairingEndpointId(endpoints: readonly PairingEndpoint[]): string {
  return [...endpoints]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((e) => e.slug)
    .join("--");
}
