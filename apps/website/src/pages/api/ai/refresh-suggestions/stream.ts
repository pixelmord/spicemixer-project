import type { APIRoute } from "astro";
import { resolveConfig, withOrigin } from "@pixelmord/content-ai-core/server";
import { subscribe } from "@/lib/pubsub.ts";
import { createAiEventLog } from "@/lib/sidecar-event-log.ts";
import { createStore } from "@/lib/content-store.ts";
import { createMetaSidecar } from "@/lib/meta-sidecar.ts";
import { runAiRefresh } from "@/lib/ai/runner.ts";

export const prerender = false;

function sse(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response("Bad request: expected JSON body", { status: 400 });
  }

  const { collection, slug, recipe, meta, missingFields, locale, force } = body as {
    collection?: string;
    slug?: string;
    recipe?: Record<string, unknown>;
    meta?: Record<string, unknown>;
    missingFields?: string[];
    locale?: string;
    force?: boolean;
  };

  if (!collection || !slug || !recipe) {
    return new Response("Bad request: collection, slug, and recipe are required", { status: 400 });
  }

  const apiKey =
    process.env["AI_API_KEY"] ??
    process.env["OPENAI_API_KEY"] ??
    import.meta.env["AI_API_KEY"] ??
    import.meta.env["OPENAI_API_KEY"] ??
    "";
  const config = { ...resolveConfig(), apiKey };
  if (!config.apiKey) {
    return new Response("AI_API_KEY is not configured", { status: 503 });
  }

  const runId = crypto.randomUUID();

  const stream = new ReadableStream({
    async start(controller) {
      const unsub = subscribe(runId, (event) => {
        controller.enqueue(sse(event));
      });

      try {
        const store = await createStore();
        const sidecar = createMetaSidecar(store);
        const eventLog = createAiEventLog(sidecar);

        const result = await withOrigin(
          {
            surface: "admin",
            action: "aiRefreshSuggestions",
            entityKind: "recipe",
            triggeredBy: "editor",
            userInitiated: true,
            runId,
          },
          () =>
            runAiRefresh({
              kind: "recipe",
              metaRef: {
                collection,
                locale: locale ?? "en",
                slug,
              },
              payload: recipe,
              existingMeta: meta ?? {},
              missingFields: missingFields ?? [],
              locale: locale ?? "en",
              store,
              sidecar,
              eventLog,
              config,
              force: force === true,
            }),
        );

        controller.enqueue(sse({ type: "complete", result }));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        controller.enqueue(sse({ type: "error", message }));
      } finally {
        unsub();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Run-Id": runId,
    },
  });
};
