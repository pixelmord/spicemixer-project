import { describe, expect, test } from "vite-plus/test";
import {
  extractFallbackObject,
  extractHowToSection,
  extractHowToStep,
  extractStringStep,
  normalizeInstructions,
} from "../src/normalize/instructions.ts";

describe("extractStringStep", () => {
  test("returns step for a normal string", () => {
    expect(extractStringStep("Boil water.")).toEqual([
      { "@type": "HowToStep", text: "Boil water." },
    ]);
  });

  test("returns empty array for empty string", () => {
    expect(extractStringStep("")).toEqual([]);
  });

  test("returns empty array for whitespace-only string", () => {
    expect(extractStringStep("   ")).toEqual([]);
  });

  test("normalizes whitespace in the string", () => {
    const result = extractStringStep("  Add  salt.  ");
    expect(result).toEqual([{ "@type": "HowToStep", text: "Add salt." }]);
  });
});

describe("extractHowToStep", () => {
  test("returns step from text field", () => {
    expect(extractHowToStep({ "@type": "HowToStep", text: "Mix well." })).toEqual([
      { "@type": "HowToStep", text: "Mix well." },
    ]);
  });

  test("falls back to name when text is absent", () => {
    expect(extractHowToStep({ "@type": "HowToStep", name: "Stir gently." })).toEqual([
      { "@type": "HowToStep", text: "Stir gently." },
    ]);
  });

  test("returns empty array when both text and name are missing", () => {
    expect(extractHowToStep({ "@type": "HowToStep" })).toEqual([]);
  });

  test("omits name when identical to text", () => {
    const result = extractHowToStep({ "@type": "HowToStep", name: "Mix well.", text: "Mix well." });
    expect(result[0]).not.toHaveProperty("name");
  });

  test("omits name when text starts with name", () => {
    const result = extractHowToStep({
      "@type": "HowToStep",
      name: "Boil water.",
      text: "Boil water. Then add salt.",
    });
    expect(result[0]).not.toHaveProperty("name");
  });

  test("includes name when it differs from text", () => {
    const result = extractHowToStep({
      "@type": "HowToStep",
      name: "Prepare sauce",
      text: "Heat oil and add tomatoes.",
    });
    expect(result[0]).toHaveProperty("name", "Prepare sauce");
  });

  test("includes url when present", () => {
    const result = extractHowToStep({
      "@type": "HowToStep",
      text: "Mix.",
      url: "https://example.com/step/1",
    });
    expect(result[0]).toHaveProperty("url", "https://example.com/step/1");
  });

  test("omits url when not a string", () => {
    const result = extractHowToStep({ "@type": "HowToStep", text: "Mix.", url: 42 });
    expect(result[0]).not.toHaveProperty("url");
  });

  test("handles legacy Step type the same as HowToStep", () => {
    const result = extractHowToStep({ "@type": "Step", text: "Season well." });
    expect(result).toEqual([{ "@type": "HowToStep", text: "Season well." }]);
  });
});

describe("extractHowToSection", () => {
  test("flattens itemListElement into steps", () => {
    const result = extractHowToSection({
      "@type": "HowToSection",
      name: "Cook",
      itemListElement: [
        { "@type": "HowToStep", text: "Boil water." },
        { "@type": "HowToStep", text: "Add pasta." },
      ],
    });
    expect(result).toEqual([
      { "@type": "HowToStep", text: "Boil water." },
      { "@type": "HowToStep", text: "Add pasta." },
    ]);
  });

  test("returns empty array when itemListElement is absent", () => {
    expect(extractHowToSection({ "@type": "HowToSection", name: "Cook" })).toEqual([]);
  });

  test("returns empty array when itemListElement is not an array", () => {
    expect(extractHowToSection({ "@type": "HowToSection", itemListElement: "invalid" })).toEqual(
      [],
    );
  });

  test("recursively flattens nested HowToSection children", () => {
    const result = extractHowToSection({
      "@type": "HowToSection",
      itemListElement: [
        {
          "@type": "HowToSection",
          itemListElement: [{ "@type": "HowToStep", text: "Inner step." }],
        },
        { "@type": "HowToStep", text: "Outer step." },
      ],
    });
    expect(result).toEqual([
      { "@type": "HowToStep", text: "Inner step." },
      { "@type": "HowToStep", text: "Outer step." },
    ]);
  });

  test("flattens string children inside a section", () => {
    const result = extractHowToSection({
      "@type": "HowToSection",
      itemListElement: ["Stir.", "Serve."],
    });
    expect(result).toEqual([
      { "@type": "HowToStep", text: "Stir." },
      { "@type": "HowToStep", text: "Serve." },
    ]);
  });
});

describe("extractFallbackObject", () => {
  test("extracts text from unknown object with text field", () => {
    expect(extractFallbackObject({ text: "Fold in gently." })).toEqual([
      { "@type": "HowToStep", text: "Fold in gently." },
    ]);
  });

  test("falls back to name field when text is absent", () => {
    expect(extractFallbackObject({ name: "Season to taste." })).toEqual([
      { "@type": "HowToStep", text: "Season to taste." },
    ]);
  });

  test("returns empty array when neither text nor name is present", () => {
    expect(extractFallbackObject({ description: "nothing useful" })).toEqual([]);
  });
});

describe("normalizeInstructions", () => {
  test("normalizes string array to HowToStep array", () => {
    const result = normalizeInstructions(["Step one.", "Step two."]);
    expect(result).toEqual([
      { "@type": "HowToStep", text: "Step one." },
      { "@type": "HowToStep", text: "Step two." },
    ]);
  });

  test("passes through HowToStep objects", () => {
    const result = normalizeInstructions([{ "@type": "HowToStep", text: "Mix well." }]);
    expect(result).toEqual([{ "@type": "HowToStep", text: "Mix well." }]);
  });

  test("flattens HowToSection into steps", () => {
    const section = {
      "@type": "HowToSection",
      name: "Cook",
      itemListElement: [
        { "@type": "HowToStep", text: "Boil water." },
        { "@type": "HowToStep", text: "Add pasta." },
      ],
    };
    const result = normalizeInstructions([section]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ "@type": "HowToStep", text: "Boil water." });
  });

  test("omits name when identical to text start", () => {
    const step = { "@type": "HowToStep", name: "Boil water.", text: "Boil water. Then add salt." };
    const result = normalizeInstructions([step]);
    expect(result[0]).not.toHaveProperty("name");
  });

  test("includes name when it differs from text", () => {
    const step = {
      "@type": "HowToStep",
      name: "Prepare sauce",
      text: "Heat oil and add tomatoes.",
    };
    const result = normalizeInstructions([step]);
    expect(result[0]).toHaveProperty("name", "Prepare sauce");
  });

  test("returns empty array for empty input", () => {
    expect(normalizeInstructions(undefined)).toEqual([]);
    expect(normalizeInstructions([])).toEqual([]);
  });

  test("accepts a single non-array value", () => {
    const result = normalizeInstructions("Preheat oven to 180°C.");
    expect(result).toEqual([{ "@type": "HowToStep", text: "Preheat oven to 180°C." }]);
  });

  test("skips falsy and non-object items", () => {
    const result = normalizeInstructions([null, undefined, 42, "Valid step."]);
    expect(result).toEqual([{ "@type": "HowToStep", text: "Valid step." }]);
  });

  test("golden: HowToSection fixture shape — two sections + one bare step", () => {
    const raw = [
      {
        "@type": "HowToSection",
        name: "Cook the pasta",
        itemListElement: [
          { "@type": "HowToStep", text: "Bring a large pot of salted water to a boil." },
          {
            "@type": "HowToStep",
            text: "Cook spaghetti until al dente according to package directions.",
          },
        ],
      },
      {
        "@type": "HowToSection",
        name: "Make the sauce",
        itemListElement: [
          {
            "@type": "HowToStep",
            text: "Heat olive oil in a large pan and sauté garlic until golden.",
          },
          {
            "@type": "HowToStep",
            text: "Add tomatoes and simmer for 15 minutes. Season with salt and pepper.",
          },
        ],
      },
      { "@type": "HowToStep", text: "Toss pasta with sauce and serve topped with fresh basil." },
    ];
    const result = normalizeInstructions(raw);
    expect(result).toHaveLength(5);
    expect(result.every((s) => s["@type"] === "HowToStep")).toBe(true);
    expect(result[0].text).toBe("Bring a large pot of salted water to a boil.");
    expect(result[4].text).toBe("Toss pasta with sauce and serve topped with fresh basil.");
  });
});
