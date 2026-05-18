import { describe, expect, test } from "vite-plus/test";
import { recordAiEvent, prune } from "../src/events.ts";
import { hashSuggestion } from "../src/hash.ts";
import type { AiEvent } from "../src/schemas/ai-events.ts";

/**
 * Mirrors what the admin consumer (NewRecipePage) does when building the
 * initial meta sidecar for a recipe imported from a URL.
 */
function buildIngestEvents(source: { url: string; canonical?: string }, recipeName: string) {
  const sourceUrl = source.canonical ?? source.url;
  if (!sourceUrl.trim()) return [] as AiEvent[];
  return recordAiEvent([], {
    type: "ingested",
    source: sourceUrl,
    suggestion: { hash: hashSuggestion({ url: sourceUrl }), summary: recipeName },
    model: "recipe-ingestion",
  });
}

describe("ingest provenance — ingested event", () => {
  const source = { url: "https://example-food.com/recipes/pasta" };
  const name = "Pasta al Pomodoro";

  test("emits exactly one ingested event after a successful import", () => {
    const events = buildIngestEvents(source, name);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("ingested");
  });

  test("ingested event has source set to the origin URL", () => {
    const events = buildIngestEvents(source, name);
    expect(events[0].source).toBe("https://example-food.com/recipes/pasta");
  });

  test("ingested event uses canonical URL when available", () => {
    const canonicalSource = {
      url: "https://example-food.com/recipes/pasta?utm_source=share",
      canonical: "https://example-food.com/recipes/pasta",
    };
    const events = buildIngestEvents(canonicalSource, name);
    expect(events[0].source).toBe("https://example-food.com/recipes/pasta");
  });

  test("ingested event has no field property (full-document import per ADR 0004)", () => {
    const events = buildIngestEvents(source, name);
    expect(events[0].field).toBeUndefined();
  });

  test("ingested event has a valid suggestion hash", () => {
    const events = buildIngestEvents(source, name);
    expect(events[0].suggestion.hash).toMatch(/^[0-9a-f]{12}$/);
  });

  test("does not emit an ingested event when source URL is empty (AI-composed path)", () => {
    const emptySource = { url: "" };
    const events = buildIngestEvents(emptySource, "AI Generated Recipe");
    expect(events).toHaveLength(0);
  });

  test("ingested event survives pruning when soft cap is exceeded (regression)", () => {
    // Fill to 100 with auto-applied events, then append an ingested event
    const autoApplied: AiEvent[] = Array.from({ length: 100 }, (_, i) => ({
      id: `auto-${i}`,
      type: "auto-applied" as const,
      field: "tags",
      suggestion: { hash: `h${i}`, summary: "test" },
      at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      model: "m",
    }));
    const ingestedEvent: AiEvent = {
      id: "ingested-id",
      type: "ingested",
      source: "https://example.com/recipe",
      suggestion: { hash: "abc123", summary: "Test Recipe" },
      at: "2026-05-01T00:00:00.000Z",
      model: "recipe-ingestion",
    };
    const result = prune([...autoApplied, ingestedEvent]);
    expect(result).toHaveLength(100);
    expect(result.find((e) => e.type === "ingested")).toBeDefined();
    expect(result.find((e) => e.type === "ingested")?.source).toBe("https://example.com/recipe");
  });
});
