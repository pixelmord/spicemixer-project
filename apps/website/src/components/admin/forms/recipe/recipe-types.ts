/** A single step in a recipe instruction list. */
export interface HowToStep {
  "@type": "HowToStep";
  text: string;
  name?: string;
  image?: string;
}

/** A mapping from a text pattern in the ingredient list to a slug in a content collection. */
export interface IngredientLink {
  pattern: string;
  slug: string;
  kind?: "ingredient" | "recipe";
  collection?: string;
}

/** An AI-proposed ingredient link (from aiProposeIngredientLinks). */
export interface IngredientLinkProposal {
  pattern: string;
  slug: string;
  confidence: "high" | "medium" | "low";
}
