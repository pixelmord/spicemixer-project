// @ts-nocheck — vite-plus-test does not surface @vitest/browser type augmentations
import { useState } from "react";
import { render } from "vitest-browser-react";
import { describe, expect, test, vi } from "vite-plus/test";

import { SourcesArrayField, type Source } from "@/components/admin/forms/_shared/SourcesArrayField";

describe("SourcesArrayField", () => {
  test("renders an Add source button even when value is empty", async () => {
    const screen = await render(<SourcesArrayField value={[]} onChange={() => {}} />);
    await expect.element(screen.getByRole("button", { name: /add source/i })).toBeVisible();
  });

  test("renders one row per source", async () => {
    const sources: Source[] = [
      { title: "Joy of Spices", url: "https://example.com/joy" },
      { title: "Spice Atlas", url: "https://example.com/atlas" },
    ];
    const screen = await render(<SourcesArrayField value={sources} onChange={() => {}} />);
    await expect.element(screen.getByTestId("source-row-0")).toBeVisible();
    await expect.element(screen.getByTestId("source-row-1")).toBeVisible();
  });

  test("Add source appends an empty source", async () => {
    const onChange = vi.fn();
    const screen = await render(<SourcesArrayField value={[]} onChange={onChange} />);
    await screen.getByRole("button", { name: /add source/i }).click();
    expect(onChange).toHaveBeenCalledWith([{ title: "", url: "" }]);
  });

  test("editing the title field updates that row", async () => {
    function Harness() {
      const [value, setValue] = useState<Source[]>([{ title: "", url: "" }]);
      return (
        <>
          <SourcesArrayField value={value} onChange={setValue} />
          <span data-testid="snapshot">{JSON.stringify(value)}</span>
        </>
      );
    }
    const screen = await render(<Harness />);
    await screen.getByPlaceholder("Source title").fill("Joy of Spices");
    await expect
      .element(screen.getByTestId("snapshot"))
      .toHaveTextContent(`[{"title":"Joy of Spices","url":""}]`);
  });

  test("remove button deletes just that row", async () => {
    function Harness() {
      const [value, setValue] = useState<Source[]>([
        { title: "A", url: "https://a" },
        { title: "B", url: "https://b" },
      ]);
      return (
        <>
          <SourcesArrayField value={value} onChange={setValue} />
          <span data-testid="count">{value.length}</span>
          <span data-testid="snapshot">{JSON.stringify(value)}</span>
        </>
      );
    }
    const screen = await render(<Harness />);
    await screen.getByRole("button", { name: "Remove source 1" }).click();
    await expect.element(screen.getByTestId("count")).toHaveTextContent("1");
    await expect
      .element(screen.getByTestId("snapshot"))
      .toHaveTextContent(`[{"title":"B","url":"https://b"}]`);
  });

  test("clearing the author field stores undefined (not an empty string)", async () => {
    function Harness() {
      const [value, setValue] = useState<Source[]>([
        { title: "A", url: "https://a", author: "Pat" },
      ]);
      return (
        <>
          <SourcesArrayField value={value} onChange={setValue} />
          <span data-testid="author">
            {value[0]?.author === undefined ? "<none>" : value[0].author}
          </span>
        </>
      );
    }
    const screen = await render(<Harness />);
    await screen.getByPlaceholder("Author name").clear();
    await expect.element(screen.getByTestId("author")).toHaveTextContent("<none>");
  });
});
