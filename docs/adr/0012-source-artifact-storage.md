# Source artifact storage

Every AI ingestion has provenance — the upload that produced it, and
the intermediate text extraction that fed the model. Today we throw
both away. This ADR makes them first-class, content-addressable, and
strictly separate from the Astro content collection.

## Why a separate store

The natural impulse is to put the source PDF next to the recipe JSON:
`content/recipes/en/dark-chocolate-rye-cookies.source.pdf`. This is
wrong for three reasons:

1. **Copyright.** Sources are usually copyrighted (cookbooks, food
   blogs). Committing them to git permanently records verbatim copies.
   Phase 2 hosting + GitHubStore makes the history public-readable.
2. **Repo size.** Image-rich cookbook PDFs run 5–50 MB. 100 recipes is
   0.5–5 GB of git. Astro's content collection also _loads_ everything
   under `src/content/` into the build graph, even if unused.
3. **Schema purity (ADR 0001).** Content collection is schema.org-shaped
   JSON. Binary blobs alongside violate the storage frame.

## Three artifacts, one directory per source

The pipeline has three stages: original binary → extracted text →
extracted structured data. Each stage's output is preserved so evals
can hold one stage fixed and sweep the others.

```
data/sources/<binary-sha256>/
  source.<ext>                       ← original upload (pdf, jpg, txt)
  source.meta.json                   ← { kind, mime, sizeBytes, filename, uploadedAt }
  text/
    pdfjs-5.txt                      ← extracted text, strategy-named, version-suffixed
    pdfjs-5.meta.json                ← { strategy, version, charCount, pageCount, extractedAt }
    ai-vision-claude-haiku.txt       ← alternative strategy for the same binary (eval-only)
    ai-vision-claude-haiku.meta.json
  structured/
    <traceId>.json                   ← AI extract output, keyed by traceId from ADR 0011
    <traceId>.meta.json              ← { capability, model, parentTextHash, traceId, runId, at }
```

Per-binary directories rather than flat content-addressed storage
because the primary navigation is "show me everything we've ever done
with this PDF." `ls data/sources/<hash>/` gives the whole pipeline
history; flat hash-named files would require a graph traversal via
sidecars.

Strategy-named text files (`pdfjs-5.txt`, `ai-vision-claude-haiku.txt`)
make diffs trivial — comparing extraction strategies is a literal `diff`,
not a query. traceId-named structured outputs preserve every attempt;
re-running with a different prompt creates a new file, old attempts
stay for comparison.

Version-suffixing the strategy in the filename means upgrading pdfjs
produces a _new_ artifact, not an overwrite. Eval reproducibility
depends on this.

## Artifact lineage

Each derivative carries a parent-hash pointer in its meta sidecar:

- `text/<strategy>-<version>.meta.json` carries `parentBinaryHash:
<binary-sha256>` — implicit from the directory but recorded explicitly
  for portability.
- `structured/<traceId>.meta.json` carries `parentTextHash` (or
  `parentBinaryHash` on the vision path where no text artifact exists).

This makes lineage replayable: given any `structured/<traceId>.json`,
you can reconstruct exactly which binary + which text-extraction
strategy produced it. Without this, eval cases are not reproducible.

## Production pipeline unchanged

Today's `extractPdfContent` returns `{ kind: "text", ... }` from pdfjs
or `{ kind: "file", bytes, ... }` for image-only PDFs (sparse text →
direct vision). On the `kind: "file"` path, **no text artifact is
produced** — the AI sees raw bytes and emits structured output directly.

We do not change this. Production stays single-call on the vision path.
The `text/ai-vision-*.txt` artifact only materializes via an opt-in
eval flag (`evals capture --transcribe`) that runs a separate
transcription pass. Cost: 2× model calls, but only on eval-capture
runs, and only when the editor has actively asked to compare strategies.

Always materializing text first (option (ii) in the design discussion)
was rejected: doubling latency on every image PDF for an eval-only
benefit is the wrong tradeoff in Phase 1, where one editor ingests
rarely.

## Meta sidecar source descriptor

The content-side `aiEvents.ingested` entry (per ADR 0004) is enriched
beyond today's bare URL:

```ts
ingested: {
  source: { binaryHash, kind, url?, filename?, mime, sizeBytes },
  textExtraction: { strategy, version, charCount },
  structuredExtraction: { capability, model, traceId },
}
```

The `binaryHash` is the link into the source store. The meta sidecar
stays small and gitable; the binary stays out of git.

This descriptor is for **editorial** provenance — what the editor
ingested. Public-facing source attribution (URL, author, license, that
appears on the rendered recipe) is a separate concern, lives in the
schema.org `isBasedOn` field on the content itself, and is curated, not
auto-derived. Don't conflate the two.

## Phase 2 portability

`data/sources/` is a `LocalSourceStore` implementation behind a
hash-keyed interface. Phase 2 swaps it for `S3SourceStore` (or R2,
Backblaze, etc.) — the hash becomes the object key, the directory
becomes a prefix. No call-site changes; the meta sidecar's `binaryHash`
pointer is portable. Mirrors the `ContentStore` story from ADR 0006.

## Consequences

- New module `packages/content-ai/src/source-store/` with `SourceStore`
  interface, `LocalSourceStore` impl, hash-keyed read/write API.
- `data/sources/` added to repo `.gitignore`.
- Astro action handlers that ingest (`aiExtractRecipe`,
  `aiExtractIngredient`, `aiExtractPairing`, `aiMergeRecipe`'s URL
  branch) write the binary + text + structured artifacts to the store
  before returning.
- `aiEvents.ingested.source` schema migrates from `string` (URL only)
  to the structured descriptor above. Old events with `source: string`
  are tolerated and treated as `{ kind: "url", url: <string> }`.
- The ingest UI gains a "View source" affordance per recipe that reads
  the binary back from `LocalSourceStore` — the editor can pull up the
  original PDF days later.
- Evals (per the implementation plan) read fixtures from the source
  store, not from a duplicated `evals/fixtures/` tree. The forward-
  capture eval bootstrap is literally "the source store, filtered by
  `aiEvents.accepted`."

## Out of scope for this ADR

- The eval framework itself (evalite + scorers + run cadence) — see
  the implementation plan.
- The OTel/Sentry trace pipeline — see ADR 0011.
- Public-facing source attribution (`isBasedOn` curation flow) — future
  work; not blocked by this ADR.

## Reference

Decided in the 2026-05-08 grilling session, immediately following ADR 0011. Cross-references: ADR 0001 (schema.org as storage), ADR 0004
(`aiEvents`), ADR 0006 (persistence adapter pattern), ADR 0011 (AI
Trace `traceId` linking).
