import { createProvider as coreCreateProvider } from "@pixelmord/content-ai-core";
import { FileTraceSink } from "@/lib/trace/file.ts";
import { SentrySpanSink } from "@/lib/trace/sentry.ts";
import { PubSubTraceSink } from "@/lib/trace/pubsub.ts";

export { resolveConfig, PROVIDER_OPTIONS } from "@pixelmord/content-ai-core";
export type { AiConfig } from "@pixelmord/content-ai-core";

const fileSink = new FileTraceSink();
const sentrySink = new SentrySpanSink();
const pubSubSink = new PubSubTraceSink();

export function createProvider(config: Parameters<typeof coreCreateProvider>[0]) {
  return coreCreateProvider(config, { sinks: [fileSink, sentrySink, pubSubSink] });
}
