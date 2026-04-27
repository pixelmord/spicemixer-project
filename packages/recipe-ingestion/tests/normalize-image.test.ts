import { describe, expect, test } from "vite-plus/test";
import { normalizeImage } from "../src/normalize/image.ts";

describe("normalizeImage", () => {
  test("passes through absolute URL string", () => {
    expect(normalizeImage("https://example.com/img.jpg")).toBe("https://example.com/img.jpg");
  });

  test("extracts url from ImageObject", () => {
    expect(normalizeImage({ "@type": "ImageObject", url: "https://example.com/img.jpg" })).toBe(
      "https://example.com/img.jpg",
    );
  });

  test("returns array for multiple images", () => {
    const result = normalizeImage(["https://example.com/a.jpg", "https://example.com/b.jpg"]);
    expect(result).toEqual(["https://example.com/a.jpg", "https://example.com/b.jpg"]);
  });

  test("unwraps single-item array to string", () => {
    expect(normalizeImage(["https://example.com/img.jpg"])).toBe("https://example.com/img.jpg");
  });

  test("filters out relative URLs", () => {
    expect(normalizeImage("/images/local.jpg")).toBeUndefined();
  });

  test("returns undefined for empty input", () => {
    expect(normalizeImage(undefined)).toBeUndefined();
    expect(normalizeImage(null)).toBeUndefined();
    expect(normalizeImage([])).toBeUndefined();
  });
});
