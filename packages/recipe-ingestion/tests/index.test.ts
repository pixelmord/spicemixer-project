import { expect, test } from "vite-plus/test";
import { extractJsonLd, findRecipe, IngestError, recipeSchema } from "../src/index.ts";

test("recipeSchema is exported", () => {
  expect(recipeSchema).toBeDefined();
});

test("extractJsonLd is exported", () => {
  expect(typeof extractJsonLd).toBe("function");
});

test("findRecipe is exported", () => {
  expect(typeof findRecipe).toBe("function");
});

test("IngestError is exported with correct name", () => {
  const err = new IngestError("NO_JSONLD", "test");
  expect(err.name).toBe("IngestError");
  expect(err.code).toBe("NO_JSONLD");
  expect(err).toBeInstanceOf(Error);
});
