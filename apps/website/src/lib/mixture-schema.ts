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
