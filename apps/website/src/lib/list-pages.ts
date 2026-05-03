export type ItemRenderer = (item: unknown) => {
  href: string;
  filterAttrs: Record<string, string>;
};

export type ListPageConfig = {
  label: string;
  filterSchema: string[];
  itemRenderer: ItemRenderer;
};

const registry = new Map<string, ListPageConfig>();

export function registerListPage(collection: string, config: ListPageConfig): void {
  registry.set(collection, config);
}

export function lookupListPage(collection: string): ListPageConfig | undefined {
  return registry.get(collection);
}
