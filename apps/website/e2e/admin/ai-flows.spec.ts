import { test } from "@playwright/test";

/**
 * AI-flow CRUD coverage is deferred. The mock provider (`AI_PROVIDER=mock`)
 * synthesizes minimum-valid JSON from each call's response schema, which is
 * enough to keep AI actions from crashing — but actually asserting suggestion
 * UI shows/accepts/persists the mock payload requires per-contract fixtures
 * that don't exist yet. Tracking issue: add when we wire pair-of-contracts
 * snapshot fixtures.
 */
test.fixme("aiProposeTags renders mock suggestion in AiAssistPanel", async () => {});
test.fixme("aiMergeRecipe shows diff with mock payload", async () => {});
test.fixme("aiCreateTranslation persists a translated meta sidecar", async () => {});

test.fixme("PairingForm enhance — file source: opens IngestDialog, shows PairingDiff, applies description", async () => {});
test.fixme("PairingForm enhance — text source: opens IngestDialog, shows PairingDiff, applies description", async () => {});
test.fixme("PairingForm enhance — prompt source: opens IngestDialog, shows PairingDiff, applies description", async () => {});
