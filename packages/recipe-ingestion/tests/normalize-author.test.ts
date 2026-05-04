import { describe, expect, test } from "vite-plus/test";
import { normalizeAuthor } from "../src/normalize/author.ts";
import { buildRefIndex } from "../src/util/refs.ts";

const emptyRefs = buildRefIndex([]);

describe("normalizeAuthor — falsy inputs", () => {
  test.each([undefined, null, "", false, 0])("returns undefined for %s", (raw) => {
    expect(normalizeAuthor(raw, emptyRefs)).toBeUndefined();
  });
});

describe("normalizeAuthor — string input", () => {
  test("plain string → Person with that name", () => {
    const result = normalizeAuthor("Julia Child", emptyRefs);
    expect(result).toEqual({ "@type": "Person", name: "Julia Child" });
  });

  test("whitespace-only string → undefined", () => {
    expect(normalizeAuthor("   ", emptyRefs)).toBeUndefined();
  });
});

describe("normalizeAuthor — object input", () => {
  test("Person object → Person with name", () => {
    const result = normalizeAuthor({ "@type": "Person", name: "Ada Lovelace" }, emptyRefs);
    expect(result).toEqual({ "@type": "Person", name: "Ada Lovelace" });
  });

  test("Organization → Organization type preserved", () => {
    const result = normalizeAuthor({ "@type": "Organization", name: "Bon Appétit" }, emptyRefs);
    expect(result).toEqual({ "@type": "Organization", name: "Bon Appétit" });
  });

  test("object with url → url included", () => {
    const result = normalizeAuthor(
      { "@type": "Person", name: "Ada", url: "https://example.com/ada" },
      emptyRefs,
    ) as { url?: string };
    expect(result?.url).toBe("https://example.com/ada");
  });

  test("object missing name → undefined", () => {
    expect(normalizeAuthor({ "@type": "Person" }, emptyRefs)).toBeUndefined();
  });

  test("unknown @type defaults to Person", () => {
    const result = normalizeAuthor({ "@type": "Bot", name: "R2D2" }, emptyRefs) as {
      "@type": string;
    };
    expect(result?.["@type"]).toBe("Person");
  });
});

describe("normalizeAuthor — array input", () => {
  test("two authors → array of two", () => {
    const result = normalizeAuthor(
      [
        { "@type": "Person", name: "Alice" },
        { "@type": "Person", name: "Bob" },
      ],
      emptyRefs,
    );
    expect(Array.isArray(result)).toBe(true);
    expect((result as unknown[]).length).toBe(2);
  });

  test("one valid + one invalid → single object (not array)", () => {
    const result = normalizeAuthor(
      [{ "@type": "Person", name: "Alice" }, { "@type": "Person" }],
      emptyRefs,
    );
    expect(Array.isArray(result)).toBe(false);
    expect((result as { name: string }).name).toBe("Alice");
  });

  test("all invalid items → undefined", () => {
    expect(normalizeAuthor([{ "@type": "Person" }, null], emptyRefs)).toBeUndefined();
  });
});

describe("normalizeAuthor — @id reference resolution", () => {
  test("@id stub resolved from ref index", () => {
    const refs = buildRefIndex([
      { "@id": "https://example.com/authors/1", "@type": "Person", name: "Resolved Author" },
    ]);
    const result = normalizeAuthor({ "@id": "https://example.com/authors/1" }, refs);
    expect(result).toEqual({ "@type": "Person", name: "Resolved Author" });
  });

  test("unresolvable @id → undefined", () => {
    const result = normalizeAuthor({ "@id": "https://example.com/authors/unknown" }, emptyRefs);
    expect(result).toBeUndefined();
  });
});
