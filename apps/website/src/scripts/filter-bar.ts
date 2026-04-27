function initBar(bar: HTMLElement) {
  if (bar.dataset.bound === "true") return;
  bar.dataset.bound = "true";

  const keys = new Set(
    [...bar.querySelectorAll<HTMLElement>("[data-filter-type]")].map((b) => b.dataset.filterType!),
  );

  function readState(): Record<string, Set<string>> {
    const params = new URLSearchParams(window.location.search);
    return Object.fromEntries([...keys].map((k) => [k, new Set(params.getAll(k))]));
  }

  function writeState(state: Record<string, Set<string>>) {
    const params = new URLSearchParams();
    for (const [key, values] of Object.entries(state)) {
      for (const v of values) params.append(key, v);
    }
    const q = params.toString();
    history.replaceState(null, "", q ? `${location.pathname}?${q}` : location.pathname);
  }

  function cardValues(card: HTMLElement, key: string): string[] {
    // "tags" → dataset.filterTags, "kind" → dataset.filterKind, etc.
    const dsKey = "filter" + key[0].toUpperCase() + key.slice(1);
    return (card.dataset[dsKey] ?? "").split(",").filter(Boolean);
  }

  function matches(card: HTMLElement, state: Record<string, Set<string>>): boolean {
    for (const [key, selected] of Object.entries(state)) {
      if (selected.size === 0) continue;
      if (!cardValues(card, key).some((v) => selected.has(v))) return false;
    }
    return true;
  }

  function applyState(state: Record<string, Set<string>>) {
    const items = [...document.querySelectorAll<HTMLElement>("[data-filter-item]")];
    let visible = 0;
    for (const item of items) {
      const show = matches(item, state);
      item.hidden = !show;
      if (show) visible++;
    }

    for (const btn of bar.querySelectorAll<HTMLElement>("[data-filter-type]")) {
      const type = btn.dataset.filterType!;
      const value = btn.dataset.filterValue ?? "";
      btn.setAttribute("aria-pressed", state[type]?.has(value) ? "true" : "false");
    }

    const countEl = bar.querySelector<HTMLElement>("[data-result-count]");
    if (countEl) countEl.textContent = String(visible);

    const emptyEl = document.querySelector<HTMLElement>("[data-empty-state]");
    if (emptyEl) emptyEl.hidden = visible !== 0;

    const clearBtn = bar.querySelector<HTMLElement>("[data-clear-filters]");
    if (clearBtn) {
      clearBtn.dataset.active = Object.values(state).some((s) => s.size > 0) ? "true" : "false";
    }
  }

  function transition(update: () => void) {
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("startViewTransition" in document)
    ) {
      update();
      return;
    }
    (document as Document & { startViewTransition: (fn: () => void) => void }).startViewTransition(
      update,
    );
  }

  bar.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const filterBtn = target.closest<HTMLElement>("[data-filter-type]");
    if (filterBtn) {
      const state = readState();
      const type = filterBtn.dataset.filterType!;
      const value = filterBtn.dataset.filterValue ?? "";
      const sel = state[type] ?? new Set<string>();
      if (sel.has(value)) sel.delete(value);
      else sel.add(value);
      state[type] = sel;
      writeState(state);
      transition(() => applyState(state));
      return;
    }

    if (target.closest("[data-clear-filters]")) {
      const empty = Object.fromEntries([...keys].map((k) => [k, new Set<string>()]));
      writeState(empty);
      transition(() => applyState(empty));
    }
  });

  applyState(readState());
}

function initAll() {
  document.querySelectorAll<HTMLElement>("[data-filter-bar]").forEach(initBar);
}

document.addEventListener("astro:page-load", initAll);
