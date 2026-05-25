// @ts-nocheck — vite-plus-test does not surface @vitest/browser type augmentations
import { useState } from "react";
import { render } from "vitest-browser-react";
import { describe, expect, test, vi } from "vite-plus/test";

import { PillToggleGroup } from "@/components/admin/forms/_shared/PillToggleGroup";

const OPTIONS = ["seed", "pod", "root"] as const;

describe("PillToggleGroup", () => {
  test("renders a button for each option", async () => {
    const screen = await render(
      <PillToggleGroup options={OPTIONS} value={[]} onChange={() => {}} />,
    );
    await expect.element(screen.getByRole("button", { name: "seed" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "pod" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "root" })).toBeVisible();
  });

  test("clicking an unselected option adds it to the value", async () => {
    const onChange = vi.fn();
    const screen = await render(
      <PillToggleGroup options={OPTIONS} value={[]} onChange={onChange} />,
    );
    await screen.getByRole("button", { name: "seed" }).click();
    expect(onChange).toHaveBeenCalledWith(["seed"]);
  });

  test("clicking a selected option removes it from the value", async () => {
    const onChange = vi.fn();
    const screen = await render(
      <PillToggleGroup options={OPTIONS} value={["seed", "pod"]} onChange={onChange} />,
    );
    await screen.getByRole("button", { name: "seed" }).click();
    expect(onChange).toHaveBeenCalledWith(["pod"]);
  });

  test("selected options expose aria-pressed=true", async () => {
    const screen = await render(
      <PillToggleGroup options={OPTIONS} value={["pod"]} onChange={() => {}} />,
    );
    await expect
      .element(screen.getByRole("button", { name: "pod" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(screen.getByRole("button", { name: "seed" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  test("getLabel customizes the rendered button label", async () => {
    const screen = await render(
      <PillToggleGroup
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        getLabel={(o) => o.toUpperCase()}
      />,
    );
    await expect.element(screen.getByRole("button", { name: "SEED" })).toBeVisible();
  });

  test("integrates with stateful parent — round-trip selection", async () => {
    function Harness() {
      const [value, setValue] = useState<string[]>([]);
      return (
        <>
          <span data-testid="value">{value.join(",")}</span>
          <PillToggleGroup options={OPTIONS} value={value} onChange={setValue} />
        </>
      );
    }
    const screen = await render(<Harness />);
    await screen.getByRole("button", { name: "seed" }).click();
    await screen.getByRole("button", { name: "root" }).click();
    await expect.element(screen.getByTestId("value")).toHaveTextContent("seed,root");
    await screen.getByRole("button", { name: "seed" }).click();
    await expect.element(screen.getByTestId("value")).toHaveTextContent("root");
  });
});
