# Meta sidecar carries editorial workflow state, not site-specific data

The `.meta.json` sidecar exists because schema.org Recipe storage
(ADR 0001) cannot absorb site-specific fields. ADR 0009 extended
sidecars to ingredients without revisiting _which_ fields belong
there, so today's `ingredientMetaSchema` and `pairingMetaSchema` carry
both editorial workflow state (`aiEvents`, `canonicalLocale`,
`translationStaleSince`) and content fields (`region`,
`imageAttribution`) that the public site queries or renders.

This ADR sharpens the rule:

> **Meta** = editorial workflow state about content. Mutates via the
> editorial loop, invisible to the public site, append-only or
> derived.
> **Content** = anything the public site renders or queries,
> including taxonomy.

## Why this matters now

- `region` drives the worldmap and faceted search — queryable
  content, not workflow state. It lives in `*MetaSchema` only because
  schema.org Recipe has no `region` field; for the ingredient and
  pairing schemas (which we own), that constraint never applied.
  Current placement is copy-paste from `recipeMetaSchema`.
- `imageAttribution` renders as a credit caption on the public page
  — content, not workflow.
- `aiEvents` is append-only, grows unboundedly per entity, and
  pollutes content diffs / Astro reloads / Pagefind reindex if
  inlined. The strongest case for the sidecar.
- `draft` is currently in pairing _content_ but in ingredient and
  recipe _meta_. The rule resolves the asymmetry: `draft` is
  workflow state, sidecar in all kinds.
- `kind: "ingredient"` literal in `ingredientMetaSchema` is redundant
  with the collection name and goes away.

## Field placement

| Field                             | Today (ingredient) | Today (pairing) | Under the rule     |
| --------------------------------- | ------------------ | --------------- | ------------------ |
| `region`                          | `ingredientMeta`   | n/a             | `ingredientSchema` |
| `imageAttribution`                | `ingredientMeta`   | `pairingMeta`   | content schemas    |
| `draft`                           | `ingredientMeta`   | `pairingSchema` | meta on both       |
| `kind` literal                    | `ingredientMeta`   | n/a             | dropped            |
| `aiEvents`                        | `ingredientMeta`   | `pairingMeta`   | unchanged (meta)   |
| `canonicalLocale`, `translation*` | `ingredientMeta`   | n/a             | unchanged (meta)   |
| `canonicalFieldHashes`            | n/a                | n/a             | meta (all kinds)   |

`canonicalFieldHashes` (added with ADR 0015) is a `Record<FieldPath, string>` of per-field source-locale hashes, snapshotted at translation creation and at each refresh. It drives field-diff-aware stale refresh and is workflow state, not content — meta in all four kinds. See ADR 0015 for the full mechanism.

Recipe and mixture meta are unchanged — schema.org Recipe storage
(ADR 0001) still forces displacement for `region`, attribution,
draft. The rule does not migrate fields _out_ of recipe meta; it
only stops fields _entering_ ingredient/pairing meta when they
belong on content.

## Bug surfaced during grilling

`koriander.meta.json` has `aiEvents` but no `canonicalLocale` /
`region` — the auto-apply write path replaced the file instead of
read-modify-writing it. The schema's `.optional()` / `.default([])`
hides the inconsistency. AiEventLog (ADR 0011, issue #62) is the
right seam to fix this; flag the koriander entry on that issue.

## Migration

A separate issue. Schema move in `apps/website/src/content.config.ts`
is small; the consumer audit (meta-sidecar.ts, recipe-augment.ts,
translation-sync.ts, admin pages, tests, migrate-canonical-locale.ts)
and data migration (8 ingredient meta files, 10 pairing content
files) ride with it.

## Alternatives rejected

- **Drop the sidecar entirely for ingredient/pairing.** Initial
  framing of this grilling session. Rejected because `aiEvents` grows
  unboundedly per entity and inlining pollutes content diffs and
  public-site reloads. The schema.org-purity justification is gone
  for these collections, but the workflow-isolation justification is
  not.
- **Keep current placement, document it as the convention.**
  Cements an asymmetry (`region` in meta for ingredient, in meta for
  recipe — _coincidentally_ same place, different reasons; `draft`
  in content for pairing, meta for the others). Future contributors
  reading `ingredientMetaSchema` cannot tell why each field is
  there.

## Reference

Decided in the 2026-05-14 grilling session. Generalises ADR 0001's
"site-specific data → sidecar" framing; ADR 0001's narrow claim that
schema.org Recipe storage cannot absorb site-specific fields remains
intact.
