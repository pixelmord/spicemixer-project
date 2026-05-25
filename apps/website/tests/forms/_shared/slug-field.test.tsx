// @ts-nocheck — vite-plus-test does not surface @vitest/browser type augmentations
import { useState } from "react";
import { render } from "vitest-browser-react";
import { describe, expect, test, vi } from "vite-plus/test";

import { SlugField } from "@/components/admin/forms/_shared/SlugField";

const noopSuggest = async () => null;

describe("SlugField", () => {
  test("renders an input bound to the slug value", async () => {
    const screen = await render(
      <SlugField slug="cardamom" onChange={() => {}} name="" onAiSuggest={noopSuggest} />,
    );
    await expect.element(screen.getByPlaceholder("cardamom")).toBeVisible();
  });

  test("editing the input fires onChange with the typed value", async () => {
    function Harness() {
      const [slug, setSlug] = useState("");
      return (
        <>
          <SlugField slug={slug} onChange={setSlug} name="cardamom" onAiSuggest={noopSuggest} />
          <span data-testid="value">{slug}</span>
        </>
      );
    }
    const screen = await render(<Harness />);
    await screen.getByRole("textbox", { name: "Slug" }).fill("cardamom");
    await expect.element(screen.getByTestId("value")).toHaveTextContent("cardamom");
  });

  test("shows ellipsis while checking", async () => {
    const screen = await render(
      <SlugField slug="cardamom" onChange={() => {}} name="" checking onAiSuggest={noopSuggest} />,
    );
    await expect.element(screen.getByTestId("slug-status")).toHaveTextContent("…");
  });

  test("shows 'available' when slugAvailable=true", async () => {
    const screen = await render(
      <SlugField
        slug="cardamom"
        onChange={() => {}}
        name=""
        available={true}
        onAiSuggest={noopSuggest}
      />,
    );
    await expect.element(screen.getByTestId("slug-status")).toHaveTextContent("available");
  });

  test("shows 'taken' when slugAvailable=false", async () => {
    const screen = await render(
      <SlugField
        slug="cardamom"
        onChange={() => {}}
        name=""
        available={false}
        onAiSuggest={noopSuggest}
      />,
    );
    await expect.element(screen.getByTestId("slug-status")).toHaveTextContent("taken");
  });

  test("hides the status indicator when slug is empty", async () => {
    const screen = await render(
      <SlugField slug="" onChange={() => {}} name="" available={true} onAiSuggest={noopSuggest} />,
    );
    expect(await screen.getByTestId("slug-status").elements().length).toBe(0);
  });

  test("AI suggest button is disabled when name is empty", async () => {
    const screen = await render(
      <SlugField slug="" onChange={() => {}} name="" onAiSuggest={noopSuggest} />,
    );
    await expect.element(screen.getByRole("button", { name: "AI suggest slug" })).toBeDisabled();
  });

  test("AI suggest button calls onAiSuggest with the current name and applies the suggestion", async () => {
    const onAiSuggest = vi.fn().mockResolvedValue("ground-cardamom");
    const onChange = vi.fn();
    const screen = await render(
      <SlugField slug="" onChange={onChange} name="ground cardamom" onAiSuggest={onAiSuggest} />,
    );
    await screen.getByRole("button", { name: "AI suggest slug" }).click();
    expect(onAiSuggest).toHaveBeenCalledWith("ground cardamom");
    expect(onChange).toHaveBeenCalledWith("ground-cardamom");
  });

  test("AI suggest errors are forwarded to onAiSuggestError", async () => {
    const onAiSuggestError = vi.fn();
    const onAiSuggest = vi.fn().mockRejectedValue(new Error("nope"));
    const screen = await render(
      <SlugField
        slug=""
        onChange={() => {}}
        name="cardamom"
        onAiSuggest={onAiSuggest}
        onAiSuggestError={onAiSuggestError}
      />,
    );
    await screen.getByRole("button", { name: "AI suggest slug" }).click();
    await vi.waitFor(() => expect(onAiSuggestError).toHaveBeenCalledTimes(1));
  });
});
