# schema.org Recipe is the canonical storage format

Recipes, spice mixes, and sauces are stored as pure schema.org Recipe JSON-LD. The storage schema never diverges from the ingestion schema — both are owned by the `recipe-ingestion` package and imported by `content.config.ts`. All site-specific data (tags, ingredient links, AI suggestions, translations, attribution) lives exclusively in the `.meta.json` sidecar files, which have their own schema that evolves independently.

## Consequences

- Any new field that does not belong to schema.org Recipe must go into the sidecar, not the recipe file.
- The `recipe-ingestion` package is the single source of truth for the Recipe schema. `content.config.ts` imports it rather than duplicating it.
- If ingestion needs to populate site-specific data (e.g. detected language, suggested tags), it must write to the sidecar — not extend the recipe file.
