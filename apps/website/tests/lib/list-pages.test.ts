import { describe, expect, test } from "vite-plus/test";
import { registerListPage, lookupListPage } from "../../src/lib/list-pages.ts";

describe("list-pages registry", () => {
  test("registering a collection and looking it up returns the configured renderer", () => {
    const renderer = (_item: unknown) => ({ href: "/", filterAttrs: {} });
    registerListPage("test-collection", {
      label: "Test",
      filterSchema: ["kind"],
      itemRenderer: renderer,
    });
    const found = lookupListPage("test-collection");
    expect(found?.itemRenderer).toBe(renderer);
  });

  test("looking up an unregistered collection returns undefined", () => {
    expect(lookupListPage("unregistered-collection-xyz")).toBeUndefined();
  });

  test("registered label is preserved on lookup", () => {
    registerListPage("label-test", {
      label: "My Label",
      filterSchema: ["a"],
      itemRenderer: () => ({ href: "/", filterAttrs: {} }),
    });
    expect(lookupListPage("label-test")?.label).toBe("My Label");
  });

  test("registered filterSchema is preserved on lookup", () => {
    registerListPage("filter-test", {
      label: "Filter",
      filterSchema: ["region", "category"],
      itemRenderer: () => ({ href: "/", filterAttrs: {} }),
    });
    expect(lookupListPage("filter-test")?.filterSchema).toEqual(["region", "category"]);
  });

  test("re-registering a collection overwrites the previous config", () => {
    const first = () => ({ href: "/first", filterAttrs: {} });
    const second = () => ({ href: "/second", filterAttrs: {} });
    registerListPage("overwrite-test", { label: "First", filterSchema: [], itemRenderer: first });
    registerListPage("overwrite-test", { label: "Second", filterSchema: [], itemRenderer: second });
    expect(lookupListPage("overwrite-test")?.label).toBe("Second");
    expect(lookupListPage("overwrite-test")?.itemRenderer).toBe(second);
  });
});
