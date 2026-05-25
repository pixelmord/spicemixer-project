# e2e content overlay

Test-only content files copied **on top of** `apps/website/src/content/` after
`global-setup.ts` snapshots production content into `e2e/.tmp/content/`.

## When to add a file here

Any time a test needs a content state that does not exist (or contradicts)
what lives in `src/content/`. Examples:

- A draft translation sidecar that production content does not carry.
- A meta sidecar variant (e.g. `draft: true`) that would break a curator's
  working copy if committed under `src/content/`.
- A throw-away test entity that should never ship to the public site.

## Hard rules

1. **Never edit `src/content/` to make an e2e test pass.** Add the file here
   instead. Real content space belongs to the curator and feeds the public
   build.
2. **Mirror the `src/content/` layout exactly.** Files placed here are copied
   to the same relative path under `e2e/.tmp/content/`, overwriting any
   snapshot from production.
3. **Prefer dedicated test slugs** (e.g. `e2e-translation-fixture`) over
   piggy-backing on real entities. Real-slug overlays are a last resort —
   they hide the fact that production data is being mutated by tests.
4. **Commit overlay files to git.** They are part of the test contract, not
   throw-away state.

## Mechanics

`global-setup.ts` does:

```
cp -r src/content/         → e2e/.tmp/content/   (production snapshot)
cp -r e2e/fixtures/content-overlay/  → e2e/.tmp/content/   (overlay, overwrites)
```

The Playwright webServer is launched with
`CONTENT_ROOT=apps/website/e2e/.tmp/content`, which `LocalFsStore` honors.
Admin writes during a test mutate the tmp tree only; `globalTeardown` wipes
it after the run.
