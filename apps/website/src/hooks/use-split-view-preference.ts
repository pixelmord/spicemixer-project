import { useState } from "react";

const STORAGE_KEY = "spicemixer.splitViewEnabled";

function readCookie(): boolean | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${STORAGE_KEY.replace(/\./g, "\\.")}=([^;]*)`),
  );
  return match ? match[1] === "true" : undefined;
}

function writeCookie(v: boolean) {
  if (typeof document === "undefined") return;
  // 1 year, root path, lax — preference cookie, no sensitive data
  document.cookie = `${STORAGE_KEY}=${v}; path=/; max-age=31536000; samesite=lax`;
}

export function useSplitViewPreference(initialValue = false): [boolean, (v: boolean) => void] {
  const [splitView, setSplitViewState] = useState<boolean>(() => {
    const fromCookie = readCookie();
    if (fromCookie !== undefined) return fromCookie;
    try {
      const ls = localStorage.getItem(STORAGE_KEY);
      if (ls !== null) return ls === "true";
    } catch {}
    return initialValue;
  });

  function setSplitView(v: boolean) {
    writeCookie(v);
    try {
      localStorage.setItem(STORAGE_KEY, String(v));
    } catch {}
    setSplitViewState(v);
  }

  return [splitView, setSplitView];
}
