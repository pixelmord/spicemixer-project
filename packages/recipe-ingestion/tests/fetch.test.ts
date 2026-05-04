import { describe, expect, test, vi } from "vite-plus/test";
import { fetchRecipe } from "../src/fetch.ts";
import { IngestError } from "../src/errors.ts";

function makeHtml(jsonLd: object): string {
  return `<!DOCTYPE html><html><head>
<link rel="canonical" href="https://example.com/recipes/ramen" />
<meta property="og:site_name" content="Example Food" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head><body></body></html>`;
}

const MINIMAL_RECIPE = {
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Miso Ramen",
  recipeIngredient: ["miso paste", "noodles"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Boil and serve" }],
};

function mockFetch(html: string, status = 200): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(html),
  } as Response);
}

describe("fetchRecipe — success", () => {
  test("returns recipe, source, and warnings for valid HTML", async () => {
    const fetch = mockFetch(makeHtml(MINIMAL_RECIPE));
    const result = await fetchRecipe("https://example.com/recipes/ramen", { fetch });

    expect(result.recipe.name).toBe("Miso Ramen");
    expect(result.recipe.recipeIngredient).toContain("miso paste");
    expect(result.source.url).toBe("https://example.com/recipes/ramen");
    expect(result.source.canonical).toBe("https://example.com/recipes/ramen");
    expect(result.source.siteName).toBe("Example Food");
    expect(result.source.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  test("passes User-Agent header", async () => {
    const fetch = mockFetch(makeHtml(MINIMAL_RECIPE));
    await fetchRecipe("https://example.com/recipes/ramen", { fetch });
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].headers["User-Agent"]).toContain("spicemixer");
  });

  test("merges custom headers with default User-Agent", async () => {
    const fetch = mockFetch(makeHtml(MINIMAL_RECIPE));
    await fetchRecipe("https://example.com/recipes/ramen", {
      fetch,
      headers: { "X-Custom": "yes" },
    });
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].headers["X-Custom"]).toBe("yes");
    expect(call[1].headers["User-Agent"]).toBeDefined();
  });
});

describe("fetchRecipe — HTTP errors", () => {
  test.each([404, 500, 403])("HTTP %d throws FETCH_FAILED", async (status) => {
    const fetch = mockFetch("", status);
    await expect(fetchRecipe("https://example.com/recipes/ramen", { fetch })).rejects.toThrow(
      IngestError,
    );

    try {
      await fetchRecipe("https://example.com/recipes/ramen", { fetch: mockFetch("", status) });
    } catch (e) {
      expect((e as IngestError).code).toBe("FETCH_FAILED");
    }
  });
});

describe("fetchRecipe — missing content", () => {
  test("no JSON-LD throws NO_JSONLD", async () => {
    const fetch = mockFetch("<html><body>No structured data here</body></html>");
    try {
      await fetchRecipe("https://example.com/recipes/ramen", { fetch });
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as IngestError).code).toBe("NO_JSONLD");
    }
  });

  test("JSON-LD without Recipe entity throws NO_RECIPE", async () => {
    const html = makeHtml({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Not a recipe",
    });
    const fetch = mockFetch(html);
    try {
      await fetchRecipe("https://example.com/recipes/ramen", { fetch });
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as IngestError).code).toBe("NO_RECIPE");
    }
  });
});

describe("fetchRecipe — network failures", () => {
  test("fetch throws generic error → FETCH_FAILED", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    try {
      await fetchRecipe("https://example.com/recipes/ramen", { fetch });
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as IngestError).code).toBe("FETCH_FAILED");
    }
  });

  test("AbortError from timeout → TIMEOUT", async () => {
    const abortErr = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    const fetch = vi.fn().mockRejectedValue(abortErr);
    try {
      await fetchRecipe("https://example.com/recipes/ramen", { fetch, timeoutMs: 1 });
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as IngestError).code).toBe("TIMEOUT");
    }
  });
});
