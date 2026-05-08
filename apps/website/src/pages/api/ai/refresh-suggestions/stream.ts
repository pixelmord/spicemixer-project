import type { APIRoute } from "astro";
import { runWithOrigin, subscribe, createAiEventLog } from "content-ai";
import { createStore } from "@/lib/content-store.ts";
import { createMetaSidecar } from "@/lib/meta-sidecar.ts";
import { runAiRefresh } from "@/lib/ai/runner.ts";

export const prerender = false;

function resolveConfig() {
  const apiKey = process.env["AI_API_KEY"] ?? process.env["OPENAI_API_KEY"] ?? "";
  return {
    baseUrl: process.env["AI_BASE_URL"] ?? "https://api.openai.com/v1",
    apiKey,
    model: process.env["AI_MODEL"] ?? "gpt-4o-mini",
  };
}

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

  const config = resolveConfig();
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

        const result = await runWithOrigin(
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
                collection: collection as string,
                locale: (locale as string) ?? "en",
                slug: slug as string,
              },
              payload: recipe,
              existingMeta: meta ?? {},
              missingFields: missingFields ?? [],
              locale: (locale as string) ?? "en",
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
