import { describe, expect, test } from "vite-plus/test";
import { extractJsonLd } from "../src/extract.ts";

describe("extractJsonLd", () => {
  test("extracts a single ld+json script", () => {
    const html = `<script type="application/ld+json">{"@type":"Recipe","name":"Test"}</script>`;
    expect(extractJsonLd(html)).toEqual([{ "@type": "Recipe", name: "Test" }]);
  });

  test("extracts multiple ld+json scripts", () => {
    const html = `
      <script type="application/ld+json">{"@type":"WebPage"}</script>
      <script type="application/ld+json">{"@type":"Recipe","name":"Test"}</script>
    `;
    expect(extractJsonLd(html)).toHaveLength(2);
  });

  test("skips malformed JSON silently", () => {
    const html = `<script type="application/ld+json">{not valid json}</script>`;
    expect(extractJsonLd(html)).toHaveLength(0);
  });

  test("skips non-ld+json scripts", () => {
    const html = `<script type="text/javascript">var x = {"@type":"Recipe"};</script>`;
    expect(extractJsonLd(html)).toHaveLength(0);
  });

  test("handles single and double quote attribute variants", () => {
    const html = `<script type='application/ld+json'>{"@type":"Recipe","name":"T"}</script>`;
    expect(extractJsonLd(html)).toHaveLength(1);
  });

  test("returns empty array for html with no scripts", () => {
    expect(extractJsonLd("<html><body>Hello</body></html>")).toHaveLength(0);
  });
});
