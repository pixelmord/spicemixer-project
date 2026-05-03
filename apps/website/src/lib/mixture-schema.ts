export const MIXTURE_KINDS = [
  "spicemix",
  "sauce",
  "rub",
  "oil",
  "pickle",
  "chutney",
  "marinade",
] as const;

export type MixtureKind = (typeof MIXTURE_KINDS)[number];

export const MIXTURE_KIND_PLURALS: Readonly<Record<MixtureKind, string>> = {
  spicemix: "spicemixes",
  sauce: "sauces",
  rub: "rubs",
  oil: "oils",
  pickle: "pickles",
  chutney: "chutneys",
  marinade: "marinades",
} as const;

export function pluralToKind(plural: string): MixtureKind | undefined {
  return MIXTURE_KINDS.find((k) => MIXTURE_KIND_PLURALS[k] === plural);
}

export function buildKindBySlug(
  metaEntries: readonly { id: string; data: Record<string, unknown> }[],
): Map<string, MixtureKind> {
  const map = new Map<string, MixtureKind>();
  for (const entry of metaEntries) {
    if (!entry.id.startsWith("mixtures/")) continue;
    const slug = entry.id.slice("mixtures/".length);
    const kind = entry.data.kind;
    if (typeof kind === "string" && (MIXTURE_KINDS as readonly string[]).includes(kind)) {
      map.set(slug, kind as MixtureKind);
    }
  }
  return map;
}
