import { describe, expect, test } from "vite-plus/test";
import { translationBehaviorSchema, resolveTranslation } from "../src/translation.ts";
import type { FieldConfig } from "../src/contract.ts";

describe("translationBehaviorSchema", () => {
  test("parses translate mode", () => {
    expect(translationBehaviorSchema.parse({ mode: "translate" })).toEqual({ mode: "translate" });
  });

  test("parses copy mode", () => {
    expect(translationBehaviorSchema.parse({ mode: "copy" })).toEqual({ mode: "copy" });
  });

  test("parses localize without instruction", () => {
    expect(translationBehaviorSchema.parse({ mode: "localize" })).toEqual({ mode: "localize" });
  });

  test("parses localize with instruction", () => {
    expect(
      translationBehaviorSchema.parse({ mode: "localize", instruction: "Use local phrasing" }),
    ).toEqual({
      mode: "localize",
      instruction: "Use local phrasing",
    });
  });

  test("parses skip mode", () => {
    expect(translationBehaviorSchema.parse({ mode: "skip" })).toEqual({ mode: "skip" });
  });

  test("rejects unknown mode", () => {
    expect(() => translationBehaviorSchema.parse({ mode: "mutate" })).toThrow();
  });
});

describe("resolveTranslation", () => {
  test("returns translate when config is undefined", () => {
    expect(resolveTranslation(undefined)).toEqual({ mode: "translate" });
  });

  test("returns translate when translation is absent from config", () => {
    const cfg: FieldConfig = {};
    expect(resolveTranslation(cfg)).toEqual({ mode: "translate" });
  });

  test("returns explicit copy translation", () => {
    const cfg: FieldConfig = { translation: { mode: "copy" } };
    expect(resolveTranslation(cfg)).toEqual({ mode: "copy" });
  });

  test("returns explicit skip translation", () => {
    const cfg: FieldConfig = { translation: { mode: "skip" } };
    expect(resolveTranslation(cfg)).toEqual({ mode: "skip" });
  });
});
