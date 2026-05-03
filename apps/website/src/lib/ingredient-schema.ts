export const INGREDIENT_PARTS = [
  "seed",
  "leaf",
  "root",
  "bark",
  "fruit",
  "flower",
  "bulb",
  "rhizome",
] as const;

export const INGREDIENT_FLAVOR_PROFILE = [
  "warm",
  "citrusy",
  "bitter",
  "pungent",
  "sweet",
  "earthy",
  "floral",
  "herbaceous",
  "smoky",
  "umami",
  "sour",
] as const;

export const INGREDIENT_LONGFORM_FIELDS = [
  "culinaryUse",
  "medicinalUses",
  "healthBenefits",
  "safetyNotes",
  "history",
  "storage",
  "sourcing",
] as const;

export const INGREDIENT_SECTION_FIELDS = [
  "summary",
  "description",
  ...INGREDIENT_LONGFORM_FIELDS,
] as const;

export type IngredientPart = (typeof INGREDIENT_PARTS)[number];
export type IngredientFlavorProfile = (typeof INGREDIENT_FLAVOR_PROFILE)[number];
export type IngredientLongformField = (typeof INGREDIENT_LONGFORM_FIELDS)[number];
export type IngredientSectionField = (typeof INGREDIENT_SECTION_FIELDS)[number];
