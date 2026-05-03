const KEY = "spicemixer.viewMode";

export type ViewMode = "cook" | "default";

export function getViewMode(): ViewMode {
  try {
    return localStorage.getItem(KEY) === "cook" ? "cook" : "default";
  } catch {
    return "default";
  }
}

export function setViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Graceful degradation for private browsing / hardened browsers.
  }
  window.dispatchEvent(new CustomEvent("viewmodechange", { detail: mode }));
}

export function toggleViewMode(): ViewMode {
  const next: ViewMode = getViewMode() === "cook" ? "default" : "cook";
  setViewMode(next);
  return next;
}

export function subscribeViewMode(cb: (mode: ViewMode) => void): () => void {
  cb(getViewMode());
  const handler = () => cb(getViewMode());
  window.addEventListener("viewmodechange", handler);
  return () => window.removeEventListener("viewmodechange", handler);
}
