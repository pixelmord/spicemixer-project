import { useState } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import type { SourceShape } from "@/components/admin/FileTextPromptSourcePicker.tsx";
import type { RecipeCollection } from "@/lib/content-store.ts";

export type IngestActionOptions =
  | {
      kind: "recipe";
      slug: string;
      locale: "en" | "de";
      collection: RecipeCollection;
      existing: Record<string, unknown>;
    }
  | {
      kind: "ingredient";
      slug: string;
      locale: "en" | "de";
      existing: Record<string, unknown>;
    }
  | {
      kind: "pairing";
      slug: string;
      locale: string;
      existing: Record<string, unknown>;
    };

export interface UseIngestActionReturn {
  onRun: (source: SourceShape) => Promise<void>;
  proposed: Record<string, unknown> | null;
  warnings: string[];
  mergeModel: string | null;
  clearProposed: () => void;
}

function appendSource(formData: FormData, source: SourceShape): void {
  if (source.kind === "file") {
    formData.append("sourceKind", "file");
    formData.append("file", source.file);
    formData.append("mimeType", source.mimeType);
  } else if (source.kind === "text") {
    formData.append("sourceKind", "text");
    formData.append("text", source.content);
  } else {
    formData.append("sourceKind", "prompt");
    formData.append("prompt", source.prompt);
  }
}

export function useIngestAction(options: IngestActionOptions): UseIngestActionReturn {
  const [proposed, setProposed] = useState<Record<string, unknown> | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [mergeModel, setMergeModel] = useState<string | null>(null);

  function clearProposed(): void {
    setProposed(null);
    setWarnings([]);
    setMergeModel(null);
  }

  async function onRun(source: SourceShape): Promise<void> {
    const { kind, existing, locale } = options;
    try {
      const formData = new FormData();

      let pairingDescriptions: Record<string, string> | undefined;
      if (kind === "pairing") {
        pairingDescriptions = (existing["descriptions"] as Record<string, string>) ?? {};
        const currentDesc =
          pairingDescriptions[locale] ??
          pairingDescriptions["en"] ??
          (typeof existing["description"] === "string" ? existing["description"] : "");
        formData.append("existing", JSON.stringify({ ...existing, description: currentDesc }));
        formData.append("locale", locale);
      } else {
        formData.append("existing", JSON.stringify(existing));
      }
      appendSource(formData, source);

      let nextProposed: Record<string, unknown>;
      let nextWarnings: string[];
      let nextModel: string | undefined;

      if (kind === "recipe") {
        const { data, error } = await actions.aiMergeRecipe(formData);
        if (error || !data) throw new Error(error?.message ?? "Merge failed");
        nextProposed = data.recipe as Record<string, unknown>;
        nextWarnings = data.warnings;
        nextModel = data.model;
      } else if (kind === "ingredient") {
        const { data, error } = await actions.aiMergeIngredient(formData);
        if (error || !data) throw new Error(error?.message ?? "Merge failed");
        nextProposed = data.ingredient as Record<string, unknown>;
        nextWarnings = data.warnings;
        nextModel = data.model;
      } else {
        const { data, error } = await actions.aiMergePairing(formData);
        if (error || !data) throw new Error(error?.message ?? "Merge failed");
        nextProposed = {
          ...existing,
          descriptions: { ...pairingDescriptions!, [locale]: data.pairing.description },
        };
        nextWarnings = data.warnings;
        nextModel = data.model;
      }

      setProposed(nextProposed);
      setWarnings(nextWarnings);
      setMergeModel(nextModel ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  return { onRun, proposed, warnings, mergeModel, clearProposed };
}
