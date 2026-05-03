export type ItemRenderer = (item: unknown) => {
  href: string;
  filterAttrs: Record<string, string>;
};

export type ListPageConfig = {
  label: string;
  filterSchema: string[];
  itemRenderer: ItemRenderer;
};

const _registry = new Map<string, ListPageConfig>();

export function registerListPage(collection: string, config: ListPageConfig): void {
  _registry.set(collection, config);
}

export function lookupListPage(collection: string): ListPageConfig | undefined {
  return _registry.get(collection);
}
