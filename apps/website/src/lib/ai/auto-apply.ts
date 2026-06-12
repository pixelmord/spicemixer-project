export type Confidence = "high" | "medium" | "low";

export function isHighConfidence(confidence: Confidence | number): boolean {
  if (typeof confidence === "number") return confidence >= 0.85;
  return confidence === "high";
}

export interface LinkCandidate {
  pattern: string;
  slug: string;
  confidence: Confidence | number;
}

export interface LinkAutoApplyAction {
  pattern: string;
  slug: string;
  confidence: Confidence | number;
}

/**
 * Pure auto-apply decision for ingredient links: keep high-confidence
 * candidates whose pattern is not already present. Deduplicates within the
 * batch too, so a model that repeats a pattern in one response only yields a
 * single action. No I/O — the caller executes the plan against store + log.
 */
export function planLinkAutoApply(
  candidates: LinkCandidate[],
  existingPatterns: Set<string>,
): LinkAutoApplyAction[] {
  const seenPatterns = new Set(existingPatterns);
  const actions: LinkAutoApplyAction[] = [];
  for (const c of candidates) {
    if (!isHighConfidence(c.confidence)) continue;
    if (seenPatterns.has(c.pattern)) continue;
    seenPatterns.add(c.pattern);
    actions.push({ pattern: c.pattern, slug: c.slug, confidence: c.confidence });
  }
  return actions;
}

export interface PairingEndpoint {
  collection: string;
  slug: string;
}

export interface PairingCandidate {
  otherCollection: PairingEndpoint["collection"];
  otherSlug: string;
  rationale: string;
  confidence: Confidence | number;
}

export interface PairingAutoApplyAction {
  id: string;
  endpoints: [PairingEndpoint, PairingEndpoint];
  rationale: string;
  confidence: Confidence | number;
  otherSlug: string;
}

/**
 * Pure auto-apply decision for pairings: keep high-confidence candidates whose
 * canonical id (alphabetically sorted slug pair) is not already present. Skips
 * self-pairings and deduplicates within the batch (a repeated candidate id only
 * yields one action). The endpoints are sorted by slug so the stored pairing is
 * canonical. No I/O.
 */
export function planPairingAutoApply(
  selfSlug: string,
  selfCollection: PairingEndpoint["collection"],
  candidates: PairingCandidate[],
  existingIds: Set<string>,
): PairingAutoApplyAction[] {
  const seenIds = new Set(existingIds);
  const actions: PairingAutoApplyAction[] = [];
  for (const c of candidates) {
    if (!isHighConfidence(c.confidence)) continue;
    if (c.otherSlug === selfSlug) continue;
    const id = [selfSlug, c.otherSlug].sort().join("--");
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const endpoints = (
      [
        { collection: selfCollection, slug: selfSlug },
        { collection: c.otherCollection, slug: c.otherSlug },
      ] as [PairingEndpoint, PairingEndpoint]
    ).sort((a, b) => a.slug.localeCompare(b.slug)) as [PairingEndpoint, PairingEndpoint];
    actions.push({
      id,
      endpoints,
      rationale: c.rationale,
      confidence: c.confidence,
      otherSlug: c.otherSlug,
    });
  }
  return actions;
}
