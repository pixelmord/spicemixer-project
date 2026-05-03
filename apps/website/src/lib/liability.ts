type LiabilityScopable = {
  medicinalUses?: string;
  healthBenefits?: string;
  safetyNotes?: string;
};

const LIABILITY_FIELDS: ReadonlyArray<keyof LiabilityScopable> = [
  "medicinalUses",
  "healthBenefits",
  "safetyNotes",
];

export function hasLiabilityScope(ingredient: LiabilityScopable): boolean {
  return LIABILITY_FIELDS.some((f) => (ingredient[f] ?? "").trim().length > 0);
}
