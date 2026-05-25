import { useState } from "react";

const LS_KEY = "spicemixer.splitViewEnabled";

export function useSplitViewPreference(): [boolean, (v: boolean) => void] {
  const [splitView, setSplitViewState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_KEY) === "true";
    } catch {
      return false;
    }
  });

  function setSplitView(v: boolean) {
    try {
      localStorage.setItem(LS_KEY, String(v));
    } catch {}
    setSplitViewState(v);
  }

  return [splitView, setSplitView];
}
