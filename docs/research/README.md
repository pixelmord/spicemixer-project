# Research notes

The brainstorming and decision-making behind the project foundation.
Each session lands as a dated file. Open questions live in their own
running file. The locked glossary lives in `/CONTEXT.md` at the repo
root; architectural decisions, once firm and hard-to-reverse, graduate
to `/docs/adr/`.

## Files

- `2026-05-02-foundation-and-content-model.md` — first foundation
  session: identity, content model, relation taxonomy, variants.
  Closed Q1–Q4 + Q4.5.
- `2026-05-02-content-model-continued.md` — same-date continuation:
  collection split (mixtures + ingredients), encyclopedia depth,
  multilingual model, AI auto-apply boundary. Closed Q5–Q8.
- `open-questions.md` — live Q&A queue, ranked. Q9–Q12 remain.

## How to use

**Picking up a new session:**

1. Read the most recent dated session doc.
2. Skim `/CONTEXT.md` for the locked glossary.
3. Resume from the top of `open-questions.md`.

**Closing a session:**

1. Append to (or create) a dated session doc. Capture options
   considered, not just decisions made — the brainstorming is the
   value when the next person needs to relitigate.
2. Update `/CONTEXT.md` if any glossary or relation changed.
3. Move closed questions to the bottom of `open-questions.md` with a
   resolution date and link to the session doc.
4. If a decision is hard-to-reverse and surprising-without-context,
   write an ADR under `/docs/adr/`.
5. Append concrete build implications to the session doc's
   "Implications" section so they can be lifted into PRDs / issues
   later.

## Distilling into PRDs and issues

A session doc's "Implications" section is the seed list for product
work. Each line there is either:

- **PRD-shaped** — multiple coupled changes, needs design — moves
  into `/docs/plans/<topic>.md` and from there into a GitHub issue
  per deliverable.
- **Issue-shaped** — single concrete change — becomes a GitHub issue
  directly, citing the session doc as the rationale.

The session doc is the durable trail; PRDs and issues are the
execution artifacts.
