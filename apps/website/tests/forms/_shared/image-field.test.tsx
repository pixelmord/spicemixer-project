// @ts-nocheck — vite-plus-test does not surface @vitest/browser type augmentations
import { useState } from "react";
import { render } from "vitest-browser-react";
import { describe, expect, test, beforeEach, vi } from "vite-plus/test";

import { ImageField } from "@/components/admin/forms/_shared/ImageField";

let lastImage: { src: string; onload?: () => void; onerror?: () => void };
function makeStubImage() {
  const instance = { src: "", onload: undefined, onerror: undefined } as {
    src: string;
    onload?: () => void;
    onerror?: () => void;
  };
  lastImage = instance;
  return instance;
}

beforeEach(() => {
  lastImage = undefined as never;
  // @ts-expect-error overriding global for the test
  globalThis.Image = makeStubImage;
});

describe("ImageField", () => {
  test("renders an image URL input with the provided value", async () => {
    const screen = await render(
      <ImageField value="https://example.com/x.jpg" onChange={() => {}} />,
    );
    await expect.element(screen.getByRole("textbox", { name: /image url/i })).toBeVisible();
  });

  test("typing in the input fires onChange", async () => {
    function Harness() {
      const [value, setValue] = useState("");
      return (
        <>
          <ImageField value={value} onChange={setValue} />
          <span data-testid="value">{value}</span>
        </>
      );
    }
    const screen = await render(<Harness />);
    await screen.getByRole("textbox", { name: /image url/i }).fill("https://example.com/y.jpg");
    await expect
      .element(screen.getByTestId("value"))
      .toHaveTextContent("https://example.com/y.jpg");
  });

  test("renders 'Search image…' only when onOpenSearch is provided, and invokes it on click", async () => {
    const onOpenSearch = vi.fn();
    const screen = await render(
      <ImageField value="" onChange={() => {}} onOpenSearch={onOpenSearch} />,
    );
    await screen.getByRole("button", { name: /search image/i }).click();
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  test("does not render the search button when onOpenSearch is omitted", async () => {
    const screen = await render(<ImageField value="" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /search image/i }).elements().length).toBe(0);
  });

  test("displays attribution text when attribution is provided", async () => {
    const attribution = {
      source: "Unsplash",
      sourceUrl: "https://unsplash.com",
      creator: "Pat",
      license: "CC0",
      licenseUrl: "",
      attribution: "Pat / Unsplash (CC0)",
    };
    const screen = await render(
      <ImageField
        value="https://example.com/x.jpg"
        onChange={() => {}}
        attribution={attribution}
      />,
    );
    await expect
      .element(screen.getByTestId("image-attribution"))
      .toHaveTextContent("Pat / Unsplash (CC0)");
  });

  test("clearing the URL calls onClearAttribution", async () => {
    const onClearAttribution = vi.fn();
    function Harness() {
      const [value, setValue] = useState("https://example.com/x.jpg");
      return (
        <ImageField value={value} onChange={setValue} onClearAttribution={onClearAttribution} />
      );
    }
    const screen = await render(<Harness />);
    await screen.getByRole("textbox", { name: /image url/i }).clear();
    expect(onClearAttribution).toHaveBeenCalledTimes(1);
  });

  test("renders amber warning when the configured image fails to load", async () => {
    const screen = await render(
      <ImageField value="https://example.com/missing.jpg" onChange={() => {}} />,
    );
    // Wait until useImageHealth has attached its handler to the stub Image
    await vi.waitFor(() => expect(lastImage).toBeDefined());
    lastImage.onerror?.();
    await expect.element(screen.getByTestId("image-broken-warning")).toBeVisible();
  });
});
