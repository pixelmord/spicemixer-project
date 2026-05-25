import { useEffect, useState } from "react";

export interface UseImageHealthResult {
  broken: boolean;
  reset: () => void;
}

export function useImageHealth(url: string | undefined): UseImageHealthResult {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
    if (!url) return;
    const img = new Image();
    img.onerror = () => setBroken(true);
    img.onload = () => setBroken(false);
    img.src = url;
  }, [url]);

  return {
    broken,
    reset: () => setBroken(false),
  };
}
