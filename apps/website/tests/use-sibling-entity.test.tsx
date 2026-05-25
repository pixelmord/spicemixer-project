// @ts-nocheck — vite-plus-test does not surface @vitest/browser type augmentations
import { renderHook } from "vitest-browser-react";
import { describe, expect, test, beforeEach, vi } from "vite-plus/test";

const mockGetSiblingEntity = vi.fn();

vi.mock("@/lib/get-sibling-entity", () => ({
  getSiblingEntity: mockGetSiblingEntity,
}));

const { useSiblingEntity } = await import("@/hooks/use-sibling-entity");

beforeEach(() => {
  mockGetSiblingEntity.mockReset();
});

describe("useSiblingEntity", () => {
  test("returns null and does not fetch when enabled=false", async () => {
    const { result } = await renderHook(() =>
      useSiblingEntity({ kind: "ingredient", slug: "cardamom", locale: "de", enabled: false }),
    );
    expect(result.current).toBeNull();
    expect(mockGetSiblingEntity).not.toHaveBeenCalled();
  });

  test("returns null and does not fetch when slug is empty", async () => {
    const { result } = await renderHook(() =>
      useSiblingEntity({ kind: "ingredient", slug: "", locale: "de", enabled: true }),
    );
    expect(result.current).toBeNull();
    expect(mockGetSiblingEntity).not.toHaveBeenCalled();
  });

  test("fetches and stores the sibling when enabled+slug are set", async () => {
    const sibling = { ref: { kind: "ingredient", id: "de/cardamom" }, data: { name: "Kardamom" } };
    mockGetSiblingEntity.mockResolvedValue(sibling);

    const { result } = await renderHook(() =>
      useSiblingEntity({ kind: "ingredient", slug: "cardamom", locale: "de", enabled: true }),
    );

    await vi.waitFor(() => {
      expect(result.current).toEqual(sibling);
    });
    expect(mockGetSiblingEntity).toHaveBeenCalledWith({
      kind: "ingredient",
      slug: "cardamom",
      locale: "de",
      currentLocale: undefined,
    });
  });

  test("clears data when enabled toggles to false", async () => {
    mockGetSiblingEntity.mockResolvedValue({
      ref: { kind: "ingredient", id: "de/cardamom" },
      data: { name: "Kardamom" },
    });

    const { result, rerender } = await renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useSiblingEntity({ kind: "ingredient", slug: "cardamom", locale: "de", enabled }),
      { initialProps: { enabled: true } },
    );
    await vi.waitFor(() => expect(result.current).not.toBeNull());

    await rerender({ enabled: false });
    expect(result.current).toBeNull();
  });

  test("re-fetches when slug changes", async () => {
    mockGetSiblingEntity.mockImplementation(({ slug }: { slug: string }) =>
      Promise.resolve({
        ref: { kind: "ingredient", id: `de/${slug}` },
        data: { name: slug },
      }),
    );

    const { result, rerender } = await renderHook(
      ({ slug }: { slug: string }) =>
        useSiblingEntity({ kind: "ingredient", slug, locale: "de", enabled: true }),
      { initialProps: { slug: "cardamom" } },
    );
    await vi.waitFor(() => expect(result.current?.data.name).toBe("cardamom"));

    await rerender({ slug: "cumin" });
    await vi.waitFor(() => expect(result.current?.data.name).toBe("cumin"));
    expect(mockGetSiblingEntity).toHaveBeenCalledTimes(2);
  });
});
