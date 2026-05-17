# UI for AI suggestions is a shadcn-style registry, not an npm package

Spicemixer has ~2,000 lines of AI-suggestion UI (AiAssistPanel, EnhanceModal,
TranslateModal, InlineSuggestion, CompletenessPanel, DiffPreviewModal, and four
\*Diff components). pixelmord-hq will need the same surface. Both consumers use
React 19 + Tailwind v4 + shadcn-ui (base-ui flavour) + lucide-react, and both
want to own and modify the UI freely.

## Decision

Ship `@pixelmord/ui-registry` as a **shadcn-style code registry** (not an npm
package): a `registry.json` manifest + per-item JSON source files served from
HTTPS, consumed via `pnpm dlx shadcn@latest add <url>`. Components paste into
each consumer's repo as plain source files where they can be read and modified.

Hosted in `apps/registry/` inside the Spicemixer monorepo (deployed alongside
the website) for lift steps 1–5. Step 6 onward (pixelmord-hq adopts) promotes
to a standalone `@pixelmord/ui-registry` repo — symmetric with the npm-package
decoupling in ADR 0017.

Two-tier API following shadcn's pattern:

| Tier           | Examples                                                                                                    | Characteristics                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Primitives** | ConfidenceBadge, AcceptRejectButtons, \*SuggestionRow family                                                | Small, unopinionated, composable                        |
| **Blocks**     | AiSuggestionsIndicator, InlineFieldSuggestion, IngestDialog, SuggestionsOptions, FileTextPromptSourcePicker | Larger composed templates the consumer pastes and edits |

Plus headless hooks: `useAiSuggestions`, `SuggestionFlowProvider`.

Stack assumptions baked into every item: React 19, Tailwind v4, shadcn-ui
(base-ui flavour) at `@/components/ui/*`, lucide-react, `cn()` from
`@/lib/utils`. Registry items import **types only** from
`@pixelmord/content-ai-core` — zero runtime npm imports from lifted packages.
Runner functions are injected via props.

## Motivation

The wrong distribution shape (styled npm package) hardens the UI into an API
surface neither consumer is happy modifying — every visual tweak requires a
package release. The shadcn registry pattern fits the "UI is the part you most
need to own" thesis exactly: components paste as source, the consumer owns them
immediately and forks freely. No versioned-dependency constraint on the UI layer.

Sharing via copy-paste from Spicemixer (the alternative) produces drift: two
code bases diverge silently once pixelmord-hq starts modifying the pasted
components. The registry makes the initial copy authoritative without locking
consumers into an update contract.

The registry pattern is hard to reverse once pixelmord-hq has pasted and
modified the components. This is the expected end state — the goal is for
consumers to own their UI — so the irreversibility is intentional.

## Locked invariants carried forward

- **Types-only imports from core.** Registry items import `FieldSuggestion`,
  `AppliedSuggestion`, `TraceSummary`, `AiEvent`, `EntityRef`, `Origin`,
  `AiEventLog`, `FieldPath`, `FieldWritePolicy`, `AiContract` by type only.
  No runtime coupling to the lifted packages. (ADR 0017.)
- **ADR 0011 payload boundary.** `SuggestionTraceInfo` shows scalars only —
  model, runtimeMs, preset, userPrompt, confidence, traceId. No token counts,
  cost, system prompt, or response body exposed in editor UI.
- **Form-library independence.** Components receive `currentValue` + `onApply`
  props. `useAiSuggestions` does not mutate the form; mutation flows through
  `onApply`. Compatible with TanStack Form, react-hook-form, Convex Forms,
  plain useState.
- **Runner injection.** `onRefine: typeof runRefine` / `onFill: typeof runFill`
  injected as props. No static Astro-action or server-action import in any
  registry item.

## Open follow-ups (not blocking)

- Promote to standalone `@pixelmord/ui-registry` repo when pixelmord-hq adopts.
- Storybook / demo strategy for registry items.
- Spicemixer migration sequence: AiAssistPanel, EnhanceModal, TranslateModal,
  InlineSuggestion, CompletenessPanel → registry items.
- `ImageGridSuggestionRow` deferred until first real image-field contract.

## Cross-references

ADR 0004 — auto-apply event log shape and suppression invariant
ADR 0011 — AI observability (TraceSummary scalars only in editor UI)
ADR 0017 — AI substrate as a separate npm package
ADR 0018 — cross-repo distribution

See also: `docs/research/2026-05-15-content-ai-ui-registry.md`,
PRD #81 (this registry), PRD #82 (TranslateEntityDialog extends registry items).
