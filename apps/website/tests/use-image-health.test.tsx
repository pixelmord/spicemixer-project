// @ts-nocheck — vite-plus-test does not surface @vitest/browser type augmentations
import { renderHook } from "vitest-browser-react";
import { describe, expect, test, beforeEach } from "vite-plus/test";

import { useImageHealth } from "@/hooks/use-image-health";

// Replace global Image with a controllable stub. Each instance exposes the
// onload/onerror handlers the hook attached; the test fires the appropriate
// one to simulate load success or failure.
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

describe("useImageHealth", () => {
  test("returns broken=false when url is empty", async () => {
    const { result } = await renderHook(() => useImageHealth(""));
    expect(result.current.broken).toBe(false);
    expect(lastImage).toBeUndefined();
  });

  test("constructs an Image and assigns url when url is provided", async () => {
    await renderHook(() => useImageHealth("https://example.com/spice.jpg"));
    expect(lastImage).toBeDefined();
    expect(lastImage.src).toBe("https://example.com/spice.jpg");
  });

  test("broken stays false when the image loads successfully", async () => {
    const { result, act } = await renderHook(() => useImageHealth("https://example.com/good.jpg"));
    await act(() => lastImage.onload?.());
    expect(result.current.broken).toBe(false);
  });

  test("broken becomes true when the image fails to load", async () => {
    const { result, act } = await renderHook(() =>
      useImageHealth("https://example.com/missing.jpg"),
    );
    await act(() => lastImage.onerror?.());
    expect(result.current.broken).toBe(true);
  });

  test("reset() returns broken to false after an error", async () => {
    const { result, act } = await renderHook(() =>
      useImageHealth("https://example.com/missing.jpg"),
    );
    await act(() => lastImage.onerror?.());
    expect(result.current.broken).toBe(true);
    await act(() => result.current.reset());
    expect(result.current.broken).toBe(false);
  });

  test("changing url clears the broken state for the new url", async () => {
    const { result, act, rerender } = await renderHook(
      ({ url }: { url: string }) => useImageHealth(url),
      { initialProps: { url: "https://example.com/missing.jpg" } },
    );
    await act(() => lastImage.onerror?.());
    expect(result.current.broken).toBe(true);

    await rerender({ url: "https://example.com/different.jpg" });
    expect(result.current.broken).toBe(false);
    expect(lastImage.src).toBe("https://example.com/different.jpg");
  });
});
