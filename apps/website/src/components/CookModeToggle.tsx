import { useEffect, useState } from "react";
import { subscribeViewMode, toggleViewMode, type ViewMode } from "../lib/viewMode.ts";

interface Props {
  labels: { enter: string; exit: string };
}

export default function CookModeToggle({ labels }: Props) {
  const [mode, setMode] = useState<ViewMode>("default");

  useEffect(() => {
    return subscribeViewMode(setMode);
  }, []);

  const isCook = mode === "cook";

  function handleClick() {
    const next = toggleViewMode();
    if (next === "cook") {
      document.documentElement.setAttribute("data-mode", "cook");
    } else {
      document.documentElement.removeAttribute("data-mode");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isCook}
      className="rounded-full bg-amber-700 px-5 py-2 text-sm font-medium text-white transition hover:bg-amber-800"
    >
      {isCook ? labels.exit : labels.enter}
    </button>
  );
}
