import { useState, useEffect } from "react";
import IngredientForm from "./IngredientForm.tsx";

interface Props {
  locale: "en" | "de";
}

export default function NewIngredientPage({ locale }: Props) {
  const [ready, setReady] = useState(false);
  const [importData, setImportData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("import-ingredient");
    if (stored) {
      sessionStorage.removeItem("import-ingredient");
      try {
        const parsed = JSON.parse(stored) as { ingredient: Record<string, unknown> };
        setImportData(parsed.ingredient);
      } catch {
        // malformed — proceed with empty form
      }
    }
    setReady(true);
  }, []);

  if (!ready) return null;

  return <IngredientForm locale={locale} isNew initialData={importData as never} />;
}
