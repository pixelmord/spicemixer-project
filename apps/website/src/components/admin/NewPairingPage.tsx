import { useState, useEffect } from "react";
import PairingForm from "./forms/pairing/PairingForm.tsx";
import type { EndpointRef } from "entity-kind";

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
          ingredient1: typeof p["ingredient1"] === "string" ? p["ingredient1"] : "",
          ingredient2: typeof p["ingredient2"] === "string" ? p["ingredient2"] : "",
          description: typeof p["description"] === "string" ? p["description"] : "",
        });
      } catch {
        // ignore malformed data
      }
    }
  }, []);

  const initialEndpoints: [EndpointRef, EndpointRef] | undefined =
    importData?.ingredient1 && importData?.ingredient2
      ? [
          { collection: "ingredients", slug: importData.ingredient1 },
          { collection: "ingredients", slug: importData.ingredient2 },
        ]
      : undefined;

  const initialDescription = importData?.description ?? "";

  return (
    <PairingForm
      isNew
      locale={locale}
      initialEndpoints={initialEndpoints}
      initialDescription={initialDescription}
    />
  );
}
