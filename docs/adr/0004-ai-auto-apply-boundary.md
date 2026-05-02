# AI auto-apply boundary

The admin UI auto-applies a narrow, allowlisted set of AI outputs
without explicit editor approval. Everything else surfaces as
suggestions that the editor accepts, edits, or rejects. Every AI
event — auto-applied, accepted, rejected, ingested — is logged in
the entity's meta sidecar so suggestions can be deduplicated and
the audit trail is complete.

## Auto-apply criteria

Auto-apply is allowed only when **all four** hold:

1. **Reversible** — undo is one click; no data loss on revert.
2. **Verifiable** — editor can tell at a glance if it's right.
3. **Bounded** — the change touches a small, contained field, not
   a rewrite.
4. **Confidence-quantifiable** — the AI emits a self-reported
   confidence and the threshold is `high` (or `>= 0.85` if a
   numeric scale is in use).

Failing any criterion → the output is suggestion-only.

## Allowlist (Phase 1)

| Output                                                               | Auto-apply?                               |
| -------------------------------------------------------------------- | ----------------------------------------- |
| Ingredient link detection (text → known ingredient/mixture slug)     | ✅                                        |
| Pairing slug detection (text mentions a pairing)                     | ✅                                        |
| Language detection (`locale` / `language` field)                     | ✅                                        |
| Tag suggestions (high-confidence)                                    | ✅                                        |
| Image attribution extraction (Wikimedia/Flickr metadata)             | ✅                                        |
| Completeness gauge                                                   | ✅ display-only — does not mutate content |
| Translation candidates                                               | ❌ suggestion-only                        |
| Encyclopedia text generation (description, history, culinary use, …) | ❌                                        |
| Medicinal / health / safety content                                  | ❌                                        |
| Slug renames                                                         | ❌                                        |
| Variant fork suggestions                                             | ❌                                        |
| Pairing creation (new pairing entity)                                | ❌                                        |

Translation is suggestion-only forever — too liability-adjacent for
auto-apply, especially for medicinal/health content.

## Phase 2 rule change

For community-submitted content, **all auto-apply behaviors revert
to suggestion-only**. Auto-apply is a privilege of the
localhost-gated single-editorial admin workflow. The runtime check
gains a clause:

```ts
if (origin === "community") return suggestionOnly;
```

This is non-negotiable: the editorial-trust assumption that backs
the auto-apply allowlist does not transfer to anonymous
contributions.

## Event log

Every AI event is recorded in the entity's meta sidecar under
`aiEvents[]`:

```ts
aiEvents: [{
  type: "auto-applied" | "accepted" | "rejected" | "ingested",
  field?: string,           // omitted for full-document ingest
  suggestion: {
    hash: string,           // stable hash of normalized payload
    summary: string,        // human-readable preview
  },
  at: string,               // ISO datetime
  model: string,            // e.g. "claude-opus-4-7"
  confidence?: "high" | "medium" | "low",
  source?: string,          // for "ingested": origin URL
  reason?: string,          // for "rejected": optional editor note
}]
```

### Event types

- **`auto-applied`** — AI changed the field without asking.
  Reversible via inline "AI applied · revert" tag rendered next to
  the affected field.
- **`accepted`** — editor explicitly approved a suggestion shown
  in the suggestions panel.
- **`rejected`** — editor dismissed a suggestion. Future
  suggestions matching `(field, suggestion.hash)` are suppressed.
- **`ingested`** — full-document import (recipe-ingestion package,
  bulk metadata scrape). Captures `source` URL.

### Suggestion deduplication

Before surfacing a suggestion, the admin checks `aiEvents` for a
matching `rejected` entry on `(field, suggestion.hash)`. Match →
suppress. New suggestions on the same field with a _different_
hash render normally.

This solves the "annoying repeated rejected suggestion" problem
explicitly raised by the editor.

### Self-learning hook (Phase 1: passive)

Rejected suggestions appear in the model's prompt context as
"previously rejected for this entity: …". Phase 2 may feed the
rejection corpus into a tuning loop; the schema is forward-
compatible.

### Volume control

Soft cap: 100 events per sidecar. When exceeded, prune oldest in
this priority order:

1. Oldest `auto-applied` first (the change itself lives in the
   field; the log entry has lowest informational value).
2. Oldest `accepted` next.
3. **Never prune `rejected`** — suppression depends on it.
4. **Never prune `ingested`** — provenance.

Pruned events remain in git history; `git log` of the meta sidecar
is the deep audit trail.

### Hash function

Stable hash of the suggestion's normalized payload (sorted keys,
trimmed whitespace, lowercased free text). Stored as the first
12 hex characters of SHA-256 — keeps the log compact while
collision-resistant for the expected event volumes.

## Why one log per sidecar (not a separate event store)

- **Colocation.** The events are tied to the content's lifecycle.
  Delete the entry, delete the events.
- **History layer comes free.** Git diffs of the sidecar provide a
  full audit trail without separate machinery.
- **Inspection.** Editors and reviewers can read the log directly.
- **Phase 1 simplicity.** A separate event store is premature for a
  single-editorial workflow.

The user's explicit guidance: _"rather keep it simple."_

## Consequences

- All meta sidecar schemas gain `aiEvents: AiEvent[]`.
- Existing AI tracking (`aiSuggestions.improvements`, `aiActions`)
  consolidates into `aiEvents`. Migration logic resets the log on
  first save under the new schema; prior auto-applies remain in
  the field values themselves.
- A stable-hash utility ships in `packages/utils` (or
  `packages/content-ai`), used by both the suggestion-emit path
  and the suppression-check path.
- Admin renders inline "AI applied · revert" tags driven by
  `aiEvents` lookups.
- Suggestion panels filter through the rejection log before
  rendering.
- Pruning logic runs on every sidecar write that adds an event.
- The Phase 2 community-content path implements the
  `origin === "community"` guard before any AI mutation lands.

## Reference

Decided in the 2026-05-02 continued session. Full discussion:
`docs/research/2026-05-02-content-model-continued.md`, section Q8.
The Q8c log shape was expanded mid-session at the editor's
request to capture rejection memory and acceptance attribution
beyond the original lean auto-apply log.
