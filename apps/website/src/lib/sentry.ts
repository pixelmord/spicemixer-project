// Sentry initialization for the website app.
//
// The auto OpenAI/AI SDK integration is intentionally not registered here.
// All AI observability flows through our custom tracingMiddleware + SentrySpanSink,
// which emits only scalar OTel gen_ai.* attributes (no prompts or responses).
//
// recordInputs / recordOutputs are left at their SDK defaults (false when the
// integration is absent) — no body data ever reaches Sentry.

export async function initSentry(): Promise<void> {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) return;

  const Sentry = await import("@sentry/node");

  Sentry.init({
    dsn,
    // We handle per-span sampling inside SentrySpanSink.tracesSampler;
    // pass all sampled spans through at the SDK level.
    tracesSampleRate: 1.0,
    // Auto-instrumentation for AI SDKs is explicitly disabled.
    // Custom middleware is the sole source of gen_ai.* spans.
    integrations: (defaults) => defaults.filter((i) => !["OpenAI", "Anthropic"].includes(i.name)),
  });
}
