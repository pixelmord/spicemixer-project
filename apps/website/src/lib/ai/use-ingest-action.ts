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
      if (kind === "recipe") {
        const formData = new FormData();
        formData.append("existing", JSON.stringify(existing));
        appendSource(formData, source);
        const { data, error } = await actions.aiMergeRecipe(formData);
        if (error || !data) throw new Error(error?.message ?? "Merge failed");
        setProposed(data.recipe as Record<string, unknown>);
        setWarnings(data.warnings);
        setMergeModel(data.model ?? null);
      } else if (kind === "ingredient") {
        const formData = new FormData();
        formData.append("existing", JSON.stringify(existing));
        appendSource(formData, source);
        const { data, error } = await actions.aiMergeIngredient(formData);
        if (error || !data) throw new Error(error?.message ?? "Merge failed");
        setProposed(data.ingredient as Record<string, unknown>);
        setWarnings(data.warnings);
        setMergeModel(data.model ?? null);
      } else {
        const descriptions = (existing["descriptions"] as Record<string, string>) ?? {};
        const currentDesc =
          descriptions[locale] ??
          descriptions["en"] ??
          (typeof existing["description"] === "string" ? existing["description"] : "");
        const formData = new FormData();
        formData.append("existing", JSON.stringify({ ...existing, description: currentDesc }));
        formData.append("locale", locale);
        appendSource(formData, source);
        const { data, error } = await actions.aiMergePairing(formData);
        if (error || !data) throw new Error(error?.message ?? "Merge failed");
        const proposedDescriptions = { ...descriptions, [locale]: data.pairing.description };
        setProposed({ ...existing, descriptions: proposedDescriptions });
        setWarnings(data.warnings);
        setMergeModel(data.model ?? null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  return { onRun, proposed, warnings, mergeModel, clearProposed };
}
