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
