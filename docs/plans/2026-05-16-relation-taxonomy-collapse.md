# Relation taxonomy collapse — 2026-05-16

Plan for executing ADR 0016. Sibling to the
`2026-05-16-content-ai-translation-flow.md` plan; rides on the same
content-ai lift substrate.

## Goal

Collapse five relation shapes (`goesWellWith`, `usesBase`,
`ingredient.pairings`, `variantOf`+`variants[]`, plus the narrow
`pairings.ingredients` shape) into two:

- **Pairing entity** — widened endpoints, the universal editorial
  relation between any two content entities.
- **Variants equivalence group** — symmetric `variants: string[]` on
  canonical-locale meta, closure-on-save.

Plus reaffirm `ingredientLinks` as the structural recipe→ingredient/mixture
navigational ref.

## Migration sequence

Throwaway-content-friendly. Empty arrays everywhere except the eight
existing pairings.

1. **Schema rev: Pairing.**
   - `pairingSchema`: `ingredients: tuple<string, string>` →
     `endpoints: tuple<endpointRef, endpointRef>` where
     `endpointRef = { collection: enum(["ingredients","mixtures","recipes"]), slug: string }`.
   - Drop `descriptions: { en, de }` and the legacy `description?: string`.
   - New per-locale content shape: `description: string` on each
     `pairings/<locale>/<id>.json` (folder-per-locale per ADR 0014, now
     landed together).
   - `pairingMetaSchema`: gains `featured: z.boolean().default(false)`,
     plus the meta-sidecar shape from ADR 0013/0014 (canonicalLocale,
     translationOf, draft, aiEvents, etc.).
2. **Schema rev: recipe meta.**
   - Delete `goesWellWith`, `usesBase`, `variantOf` from
     `recipeMetaSchema`.
   - Rename `variants: array<string>` from "computed-but-stored" to
     "authored symmetric list" (no shape change, semantics change).
3. **Schema rev: ingredient.**
   - Delete `pairings: [{ slug, note? }]` from `ingredientSchema`.
4. **Content migration: pairings.**
   - For each of the eight existing pairings:
     - Split into `pairings/en/<id>.json` and `pairings/de/<id>.json`
       (per ADR 0014).
     - `description` per locale.
     - `endpoints` populated from previous `ingredients` tuple with
       `collection: "ingredients"` for both.
     - Seed `featured: true` on each meta sidecar.
5. **Content migration: recipe meta.**
   - One-shot script removes `goesWellWith`, `usesBase`, `variantOf`,
     `variants` fields from every `<collection>/<locale>/<slug>.meta.json`
     across `recipes/` and `mixtures/`. All empty in current content.
6. **Content migration: ingredient inline pairings.**
   - One-shot removal of `pairings: []` from every
     `ingredients/<locale>/<slug>.json`. All empty.
7. **Validator: cross-collection slug uniqueness.**
   - `vp check` validator: enumerate slugs across
     `ingredients`+`mixtures`+`recipes` (any locale), error on
     duplicates.
8. **Validator: variants closure symmetry.**
   - `vp check` validator: for every entity X with non-empty
     `variants` on canonical-locale meta, every Y in X.variants must
     (a) exist as a canonical-locale entity and (b) carry X in its own
     `variants` list.
9. **Save handler: variants closure-on-save.**
   - On save of an entity's `variants` field, compute the union of
     `variants` lists across the transitive closure of currently-listed
     members. Write the unified list to every member's canonical-locale
     meta in one atomic save operation (one `ContentStore.put` per
     member touched, batched via the same admin save action).
   - On unlink: remove the entity from every other member's `variants`
     list and clear its own.
10. **Public-site read path: variants resolution.**
    - On a translation page, fetch `variants` from the
      canonical-locale meta (resolved via `translationOf`), not from
      the current page's meta.
    - For each variant slug, resolve to the current-locale entity if
      present, fallback to canonical-locale page with the translation
      fallback banner (per ADR 0003).
11. **Public-site read path: pairing endpoint hrefs.**
    - `PairingSlugPage.astro` resolves each endpoint's href via its
      `collection` (currently hardcoded to `/ingredients/`).
12. **Admin UI: `CreatePairingDialog` block.**
    - Registry block from ADR 0015's `ui-registry` plan. Props: source
      entity ref, AI suggestion payload (otherEndpoint, rationale),
      locale, runner injection.
    - Preflight: endpoint review + featured checkbox.
    - In-flight: review proposed `description`, edit if needed.
    - Atomic save: writes new Pairing content + meta + fires
      `ingested` aiEvent on the new entity. Tracks source recipe's
      traceId.
13. **Admin UI: recipe / ingredient / mixture forms.**
    - Delete the "Goes well with" and "Uses base" combobox sections.
    - Replace with: AI suggestion section (renamed
      `aiSuggestions.pairings[]`) where each "Add" opens
      `CreatePairingDialog`.
    - Add read-only "Pairings featuring this entity" section, resolved
      from the pairings collection at form load time.
    - Add a `Variants` section: pick co-equal members; save fires the
      closure.
14. **AI contract: Pairing.**
    - Per-field translation behavior:
      - `description` → `translate`
      - `endpoints[].slug`, `endpoints[].collection` → `copy`
      - `featured` → `copy`
      - `image`, `imageAttribution` → `copy`
      - `imageAttribution.attribution` text → `translate`
    - `presetIds`: standard refine presets (expand, tone, research).
15. **AI proposer: pairing suggestions across forms.**
    - Recipe/ingredient/mixture form AI panels propose
      `aiSuggestions.pairings[]` with `{ otherCollection, otherSlug, rationale }`.
    - Cache invalidates on save (existing behavior); editor accept
      consumes one suggestion per Add click.
16. **Delete legacy code.**
    - `recipeLinkRef` schema (after recipe meta changes ship).
    - "Goes well with" / "Uses base" combobox JSX in `RecipeForm.tsx`.
    - `ingredient.pairings` field handling in `IngredientSlugPage.astro`
      (the per-slug `note` rendering path).
    - The `descriptions: { en, de }` resolution in
      `IngredientSlugPage.astro:54-56` after pairings move
      folder-per-locale.

## Dependencies

- ADR 0014 (folder-per-locale pairings) — lands the schema rev at the
  same time as this plan's step 1.
- ADR 0015 (translation flow) — `CreatePairingDialog` block reuses the
  registry primitives from that ADR's `TranslateEntityDialog`. Same
  preflight/in-flight/save shape.
- Content-ai lift plan (`docs/plans/2026-05-15-content-ai-package-lift.md`)
  — the AI contract for Pairing lands as part of the lift.
- UI registry plan (`docs/plans/2026-05-15-content-ai-ui-registry.md`)
  — `CreatePairingDialog` is a new registry block.

## What dies

- `goesWellWith`, `usesBase`, `variantOf` fields on `recipeMetaSchema`.
- `variants: array<string>` as "computed-but-stored" (semantics flips,
  shape stays).
- `ingredient.pairings` inline field.
- `pairings.descriptions: { en, de }` (ADR 0014).
- `pairings.description?: string` legacy field.
- `PairingTranslateModal` (ADR 0015).
- Recipe form's "Goes well with" / "Uses base" combobox JSX.
- The pairing endpoint type narrowing (`ingredients: tuple<string, string>`).

## What survives in reduced or renamed form

- `pairings.ingredients` → `pairings.endpoints` with full
  `endpointRef`.
- `aiSuggestions.relations[]` → `aiSuggestions.pairings[]` (rename +
  shape change to propose pairings, not field-fills).
- `variants` array semantics flips from "computed at read time" to
  "authored symmetric list on canonical-locale meta."

## Cross-references

- ADR 0014 — pairings folder-per-locale; this plan piggybacks the
  schema rev.
- ADR 0015 — translation flow; `CreatePairingDialog` is a sibling
  block to `TranslateEntityDialog`.
- ADR 0016 — relation taxonomy collapse (the why for this plan).
- `docs/plans/2026-05-16-content-ai-translation-flow.md` — sibling plan
  riding on the same lift substrate.
- `docs/plans/2026-05-15-content-ai-package-lift.md` — substrate.
- `docs/plans/2026-05-15-content-ai-ui-registry.md` — UI substrate.
