// No prompt or response body data reaches Sentry — AI observability uses
// only scalar OTel gen_ai.* attributes via SentrySpanSink.
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
