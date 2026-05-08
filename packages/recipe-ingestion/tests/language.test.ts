import { describe, expect, test } from "vite-plus/test";
import { extractHtmlLang, resolveLanguage } from "../src/util/language.ts";

describe("extractHtmlLang", () => {
  test("reads lang attribute from <html> tag", () => {
    expect(extractHtmlLang(`<!doctype html><html lang="de"><head></head></html>`)).toBe("de");
  });

  test("normalises BCP-47 subtags to two-letter primary", () => {
    expect(extractHtmlLang(`<html lang="de-AT"><body></body></html>`)).toBe("de");
    expect(extractHtmlLang(`<html lang="EN-US">`)).toBe("en");
  });

  test("supports xml:lang as a fallback", () => {
    expect(extractHtmlLang(`<html xml:lang="fr"><body></body></html>`)).toBe("fr");
  });

  test("ignores lang attribute on non-html elements", () => {
    expect(extractHtmlLang(`<html><body><p lang="de">hallo</p></body></html>`)).toBeUndefined();
  });

  test("returns undefined when no lang attribute is present", () => {
    expect(extractHtmlLang(`<html><body></body></html>`)).toBeUndefined();
    expect(extractHtmlLang(undefined)).toBeUndefined();
    expect(extractHtmlLang("")).toBeUndefined();
  });
});

describe("resolveLanguage", () => {
  test("prefers JSON-LD inLanguage over HTML lang", () => {
    expect(resolveLanguage("de", `<html lang="en"><body></body></html>`)).toBe("de");
  });

  test("falls back to HTML lang when inLanguage is missing or invalid", () => {
    expect(resolveLanguage(undefined, `<html lang="de">`)).toBe("de");
    expect(resolveLanguage(null, `<html lang="de">`)).toBe("de");
    expect(resolveLanguage("", `<html lang="de">`)).toBe("de");
    expect(resolveLanguage(42, `<html lang="de">`)).toBe("de");
  });

  test("returns undefined when neither source has a usable value", () => {
    expect(resolveLanguage(undefined, `<html><body></body></html>`)).toBeUndefined();
    expect(resolveLanguage("", undefined)).toBeUndefined();
  });
});
