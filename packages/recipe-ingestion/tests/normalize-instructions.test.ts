import { describe, expect, test } from "vite-plus/test";
import { normalizeInstructions } from "../src/normalize/instructions.ts";

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
});
