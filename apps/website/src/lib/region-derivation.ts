export function regionsForPairing(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): string[] {
  return [...new Set([...(a ?? []), ...(b ?? [])])];
}
