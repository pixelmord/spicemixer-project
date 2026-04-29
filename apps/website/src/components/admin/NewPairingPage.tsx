import { useState, useEffect } from "react";
import PairingForm from "./PairingForm.tsx";

interface Props {
  locale?: string;
}

export default function NewPairingPage({ locale = "en" }: Props) {
  const [importData, setImportData] = useState<{
    ingredient1?: string;
    ingredient2?: string;
    description?: string;
  } | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("import-pairing");
    if (stored) {
      sessionStorage.removeItem("import-pairing");
      try {
        const parsed = JSON.parse(stored) as { pairing: Record<string, unknown> };
        const p = parsed.pairing;
        setImportData({
          ingredient1: String(p["ingredient1"] ?? ""),
          ingredient2: String(p["ingredient2"] ?? ""),
          description: String(p["description"] ?? ""),
        });
      } catch {
        // ignore malformed data
      }
    }
  }, []);

  const initialDescriptions = importData?.description ? { [locale]: importData.description } : {};

  return (
    <PairingForm
      isNew
      initialIngredients={
        importData?.ingredient1 && importData?.ingredient2
          ? [importData.ingredient1, importData.ingredient2]
          : undefined
      }
      initialDescriptions={initialDescriptions}
    />
  );
}
