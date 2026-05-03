import { describe, expect, test } from "vite-plus/test";
import { renderInlineMarkdown } from "../../src/lib/inline-markdown.ts";

describe("renderInlineMarkdown", () => {
  test("passes plain text through unchanged (html-escaped)", () => {
    expect(renderInlineMarkdown("Hello world")).toBe("Hello world");
  });

  test("converts [text](url) to an anchor tag", () => {
    expect(renderInlineMarkdown("[OpenFarm](https://openfarm.cc)")).toBe(
      '<a href="https://openfarm.cc">OpenFarm</a>',
    );
  });

  test("converts multiple links in one string", () => {
    const input = "See [A](https://a.com) and [B](https://b.com)";
    const output = renderInlineMarkdown(input);
    expect(output).toContain('<a href="https://a.com">A</a>');
    expect(output).toContain('<a href="https://b.com">B</a>');
    expect(output).toContain(" and ");
  });

  test("escapes HTML in plain text parts", () => {
    expect(renderInlineMarkdown("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });

  test("escapes HTML in link text", () => {
    expect(renderInlineMarkdown("[a & b](https://x.com)")).toBe(
      '<a href="https://x.com">a &amp; b</a>',
    );
  });

  test("handles empty string", () => {
    expect(renderInlineMarkdown("")).toBe("");
  });
});
