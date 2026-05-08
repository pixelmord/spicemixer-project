import type { APIRoute } from "astro";
import { runWithOrigin, subscribe, generateRecipeFromPrompt } from "content-ai";

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

  const { prompt, locale, style } = body as {
    prompt?: string;
    locale?: string;
    style?: string;
  };

  if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
    return new Response("Bad request: prompt must be at least 3 characters", { status: 400 });
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
        const result = await runWithOrigin(
          {
            surface: "admin",
            action: "aiGenerateRecipe",
            entityKind: "recipe",
            triggeredBy: "editor",
            userInitiated: true,
            runId,
          },
          () =>
            generateRecipeFromPrompt(
              {
                prompt: prompt.trim(),
                locale: (locale as "en" | "de" | undefined) ?? "en",
                style: (style as "recipe" | "mixture" | undefined) ?? "recipe",
              },
              config,
            ),
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
