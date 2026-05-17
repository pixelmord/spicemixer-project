import { useState } from "react";
import type { AiEventLog, AiEvent, EntityRef, Origin } from "@/hooks/use-ai-suggestions";

export interface PairingAiSuggestion {
  otherCollection: string;
  otherSlug: string;
  rationale: string;
}

export interface PairingCreationMeta {
  draft: true;
  aiEvents: AiEvent[];
}

export interface CreatePairingDialogProps {
  sourceRef: EntityRef;
  aiSuggestion: PairingAiSuggestion;
  locale: string;
  onCreate: (
    locale: string,
    fields: Record<string, unknown>,
    meta: PairingCreationMeta,
  ) => Promise<EntityRef>;
  onComplete: (newRef: EntityRef) => void;
  aiEventLog: AiEventLog;
  origin: Origin;
}

const KIND_TO_COLLECTION: Record<string, string> = {
  ingredient: "ingredients",
  mixture: "mixtures",
  recipe: "recipes",
};

function kindToCollection(kind: string): string {
  return KIND_TO_COLLECTION[kind] ?? kind + "s";
}

function seedFeatured(sourceKind: string, otherCollection: string): boolean {
  return kindToCollection(sourceKind) === "ingredients" && otherCollection === "ingredients";
}

export function CreatePairingDialog({
  sourceRef,
  aiSuggestion,
  locale,
  onCreate,
  onComplete,
  aiEventLog,
  origin,
}: CreatePairingDialogProps) {
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState(aiSuggestion.rationale);
  const [featured, setFeatured] = useState(() =>
    seedFeatured(sourceRef.kind, aiSuggestion.otherCollection),
  );
  const [error, setError] = useState<string | null>(null);

  const sourceCollection = kindToCollection(sourceRef.kind);
  const sourceEndpoint = { collection: sourceCollection, slug: sourceRef.id };
  const otherEndpoint = {
    collection: aiSuggestion.otherCollection,
    slug: aiSuggestion.otherSlug,
  };

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const ingestedEvent: AiEvent = {
        type: "ingested",
        suggestion: { hash: origin.runId, summary: "Pairing created from AI suggestion" },
        at: new Date().toISOString(),
        model: "proposer",
        traceId: origin.runId,
      };

      const meta: PairingCreationMeta = {
        draft: true,
        aiEvents: [ingestedEvent],
      };

      const fields: Record<string, unknown> = {
        description,
        featured,
        endpoints: [sourceEndpoint, otherEndpoint],
      };

      const newRef = await onCreate(locale, fields, meta);
      await aiEventLog.append(newRef, ingestedEvent);
      onComplete(newRef);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded border bg-muted/30 p-3 text-sm">
        <p className="mb-1 text-xs font-medium text-muted-foreground">Endpoints</p>
        <p>
          {sourceCollection}: {sourceRef.id}
        </p>
        <p>
          {aiSuggestion.otherCollection}: {aiSuggestion.otherSlug}
        </p>
      </div>

      {error && (
        <p className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="space-y-1">
        <label htmlFor="pairing-description" className="text-sm font-medium">
          Description
        </label>
        <textarea
          id="pairing-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded border px-2 py-1 text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="pairing-featured"
          type="checkbox"
          checked={featured}
          onChange={(e) => setFeatured(e.target.checked)}
        />
        <label htmlFor="pairing-featured" className="text-sm">
          Featured in pairings index
        </label>
      </div>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save pairing"}
      </button>
    </div>
  );
}
