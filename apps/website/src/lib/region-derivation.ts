import type { RegionCode } from "./regions.ts";

export function regionsForPairing(
  a: { region?: string[] },
  b: { region?: string[] },
): RegionCode[] {
  return [...new Set([...(a.region ?? []), ...(b.region ?? [])])] as RegionCode[];
}
