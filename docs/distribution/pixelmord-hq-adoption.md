# Adopting `@pixelmord/content-ai-*` in pixelmord-hq

The three content-AI packages are published to GitHub Packages under the
`@pixelmord` scope. This guide covers everything needed to install and use them
in pixelmord-hq.

## Packages available

| Package                        | Description                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `@pixelmord/content-ai-core`   | AI contract types, event log interface, trace sink, Origin/ALS, fingerprinting, suppression rules, presentation helpers |
| `@pixelmord/content-ai-refine` | `runRefine` — contract-driven per-field LLM refine runner                                                               |
| `@pixelmord/content-ai-ingest` | `runFill` — source-context typed AI fill runner                                                                         |

All three packages version in lockstep (changesets fixed mode). Install the
same version number for each.

## 1. Create a Personal Access Token (PAT)

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. Create a token with scope **`read:packages`** and repository access to `pixelmord/spicemixer-project`.
3. Copy the token.

## 2. Configure `~/.npmrc` for local development

Add to your global `~/.npmrc` (create if missing):

```
@pixelmord:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_PAT_HERE
```

Replace `YOUR_PAT_HERE` with the token from step 1.

Alternatively, set the environment variable `NODE_AUTH_TOKEN` to your PAT and
use the `.npmrc` snippet without a hard-coded token:

```
@pixelmord:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

## 3. Configure CI (GitHub Actions)

1. In your pixelmord-hq repo, go to **Settings → Secrets and variables → Actions**.
2. Add a repository secret named `GH_PACKAGES_TOKEN` with the value of your PAT.

In your workflow file, configure Node to use GH Packages for the `@pixelmord` scope:

```yaml
- name: Setup Node
  uses: actions/setup-node@v4
  with:
    node-version: 22
    registry-url: https://npm.pkg.github.com
    scope: "@pixelmord"

- name: Install dependencies
  run: pnpm install --frozen-lockfile
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GH_PACKAGES_TOKEN }}
```

Add an `.npmrc` at the root of pixelmord-hq:

```
@pixelmord:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

## 4. Install the packages

```bash
pnpm add @pixelmord/content-ai-core @pixelmord/content-ai-refine @pixelmord/content-ai-ingest
```

Or pin to the current stable version:

```bash
pnpm add @pixelmord/content-ai-core@0.1.0 @pixelmord/content-ai-refine@0.1.0 @pixelmord/content-ai-ingest@0.1.0
```

## 5. Minimal usage example

```typescript
import { runRefine } from "@pixelmord/content-ai-refine";
import type { AiContract } from "@pixelmord/content-ai-refine";
import { z } from "zod";

const postSchema = z.object({
  title: z.string(),
  summary: z.string(),
});

const postContract: AiContract<typeof postSchema> = {
  schema: postSchema,
  presets: [
    {
      id: "improve",
      label: "Improve",
      description: "Improve clarity and SEO",
      instruction: "Improve the writing quality and SEO relevance.",
      appliesTo: "text",
    },
  ],
  fields: {
    title: { writePolicy: "fill-if-empty" },
    summary: { writePolicy: "replace" },
  },
};

const result = await runRefine({
  contract: postContract,
  currentData: { title: "My post", summary: "" },
  config: {
    baseUrl: "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY!,
    model: "gpt-4o-mini",
  },
});

console.log(result.suggestions); // Map<fieldPath, FieldSuggestion>
console.log(result.autoApplied); // Map<fieldPath, AppliedSuggestion>
```

## Implementing adapters

pixelmord-hq will want its own `ConvexEventLog` implementing `AiEventLog` from
`@pixelmord/content-ai-core`, and a `ConvexTraceSink` implementing `TraceSink`.
Import the interfaces:

```typescript
import type {
  AiEventLog,
  EntityRef,
  AiEvent,
  TraceSink,
  TraceEvent,
} from "@pixelmord/content-ai-core";
```

See the Spicemixer `SidecarEventLog` in `packages/content-ai/src/event-log.ts`
for a reference implementation.

## See also

- ADR 0017 — AI substrate is a separate package
- ADR 0018 — Cross-repo distribution mechanism
- Sibling smoke-test issue: `pixelmord/pixelmord-hq#<N>` (import + `tsc --noEmit` for all three packages)
