# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (most repos):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

## Authoring: three geographic/culinary axes

When tagging content, these three fields are distinct and must not be conflated:

| Field           | Type                       | Meaning                                                                         | Example                                   |
| --------------- | -------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| `region[]`      | closed enum (`RegionCode`) | Culinary macro-region — coarse, stable, drives worldmap dots and faceted search | `north-africa`, `levant`, `mediterranean` |
| `origin[]`      | free string array          | Geographic origin — finer-grained, free text, historical/botanical provenance   | `"Iran"`, `"Guatemala"`, `"South India"`  |
| `recipeCuisine` | free string (schema.org)   | Cuisine — schema.org field on recipes, editorial label, not a region            | `"Moroccan"`, `"French"`, `"Fusion"`      |

`region[]` is a **schema change** (PR + content review) to add/remove/rename codes. The canonical enum and labels live in `apps/website/src/lib/regions.ts`. Pairing entries do **not** carry `region[]` — their regions are derived at read time from the union of the two endpoint regions.

`origin[]` and `recipeCuisine` are editorial free-form fields and can be updated at any time without a schema change.
