import { useState } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Loader2, Save, Trash2, Link2, Sparkles, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";
import type { EntityOption } from "./EntityCombobox.tsx";
import EntityCombobox from "./EntityCombobox.tsx";
import IngredientLinkModal from "./IngredientLinkModal.tsx";

export interface Pairing {
  id: string;
  ingredients: [string, string];
  descriptions: Record<string, string>;
}

function resolveDescription(
  pairing: Pairing,
  locale: string,
): { text: string; isFallback: boolean } {
  if (pairing.descriptions[locale])
    return { text: pairing.descriptions[locale], isFallback: false };
  if (pairing.descriptions["en"]) return { text: pairing.descriptions["en"], isFallback: true };
  const first = Object.values(pairing.descriptions)[0];
  return { text: first ?? "", isFallback: !!first };
}

interface PairingProposal {
  slug: string;
  description: string;
  confidence: string;
}

interface Props {
  currentSlug: string;
  locale: "en" | "de";
  pairings: Pairing[];
  pendingProposals: PairingProposal[];
  ingredientOptions: EntityOption[];
  onPairingsChange: (pairings: Pairing[]) => void;
  onDismissProposal: (slug: string) => void;
  onApplyProposal: (p: PairingProposal) => void;
}

export default function PairingEditor({
  currentSlug,
  locale,
  pairings,
  pendingProposals,
  ingredientOptions,
  onPairingsChange,
  onDismissProposal,
  onApplyProposal,
}: Props) {
  const [saving, setSaving] = useState<string | null>(null);
  const [editingDescriptions, setEditingDescriptions] = useState<Record<string, string>>({});
  const [viewModalSlug, setViewModalSlug] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [savingNew, setSavingNew] = useState(false);

  function otherSlug(pairing: Pairing): string {
    return pairing.ingredients[0] === currentSlug ? pairing.ingredients[1] : pairing.ingredients[0];
  }

  function getOtherName(slug: string): string {
    return ingredientOptions.find((o) => o.value === slug)?.label ?? slug;
  }

  async function handleSaveDescription(pairing: Pairing) {
    const desc = editingDescriptions[pairing.id];
    const currentDesc = resolveDescription(pairing, locale).text;
    if (!desc || desc === currentDesc) {
      setEditingDescriptions((prev) => {
        const n = { ...prev };
        delete n[pairing.id];
        return n;
      });
      return;
    }
    setSaving(pairing.id);
    try {
      await actions.savePairing({
        id: pairing.id,
        ingredients: [
          { collection: "ingredients" as const, slug: pairing.ingredients[0] },
          { collection: "ingredients" as const, slug: pairing.ingredients[1] },
        ],
        description: desc,
        locale,
      });
      onPairingsChange(
        pairings.map((p) =>
          p.id === pairing.id ? { ...p, descriptions: { ...p.descriptions, [locale]: desc } } : p,
        ),
      );
      setEditingDescriptions((prev) => {
        const n = { ...prev };
        delete n[pairing.id];
        return n;
      });
    } catch {
      toast.error("Failed to save pairing");
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(pairing: Pairing) {
    setSaving(pairing.id);
    try {
      await actions.deletePairing({ id: pairing.id });
      onPairingsChange(pairings.filter((p) => p.id !== pairing.id));
    } catch {
      toast.error("Failed to delete pairing");
    } finally {
      setSaving(null);
    }
  }

  async function handleAddNew() {
    if (!newSlug || !newDescription.trim()) return;
    setSavingNew(true);
    const id = [currentSlug, newSlug].sort().join("--");
    try {
      await actions.savePairing({
        id,
        ingredients: [
          { collection: "ingredients" as const, slug: currentSlug },
          { collection: "ingredients" as const, slug: newSlug },
        ],
        description: newDescription,
        locale,
      });
      onPairingsChange([
        ...pairings,
        {
          id,
          ingredients: [currentSlug, newSlug].sort() as [string, string],
          descriptions: { [locale]: newDescription },
        },
      ]);
      setNewSlug("");
      setNewDescription("");
      setAddingNew(false);
    } catch {
      toast.error("Failed to create pairing");
    } finally {
      setSavingNew(false);
    }
  }

  async function handleAcceptProposal(p: PairingProposal) {
    const id = [currentSlug, p.slug].sort().join("--");
    if (pairings.some((x) => x.id === id)) {
      toast.info("Pairing already exists");
      onDismissProposal(p.slug);
      return;
    }
    setSaving(id);
    try {
      await actions.savePairing({
        id,
        ingredients: [
          { collection: "ingredients" as const, slug: currentSlug },
          { collection: "ingredients" as const, slug: p.slug },
        ],
        description: p.description,
        locale,
      });
      onPairingsChange([
        ...pairings,
        {
          id,
          ingredients: [currentSlug, p.slug].sort() as [string, string],
          descriptions: { [locale]: p.description },
        },
      ]);
      onApplyProposal(p);
    } catch {
      toast.error("Failed to create pairing");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-2">
      {/* AI proposals */}
      {pendingProposals.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-2 space-y-1.5">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
            {pendingProposals.length} pairing suggestion{pendingProposals.length !== 1 ? "s" : ""}
          </p>
          {pendingProposals.map((p) => (
            <div key={p.slug} className="flex items-start gap-2 text-xs">
              <div className="flex-1 min-w-0">
                <span className="font-medium">{getOtherName(p.slug)}</span>
                <p className="text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] shrink-0",
                  {
                    high: "text-emerald-600 border-emerald-200",
                    medium: "text-amber-600 border-amber-200",
                    low: "text-muted-foreground",
                  }[p.confidence] ?? "text-muted-foreground",
                )}
              >
                {p.confidence}
              </Badge>
              <button
                type="button"
                onClick={() => handleAcceptProposal(p)}
                disabled={saving === [currentSlug, p.slug].sort().join("--")}
                className="shrink-0 text-emerald-500 hover:text-emerald-700"
                title="Accept"
              >
                <Check size={13} />
              </button>
              <button
                type="button"
                onClick={() => onDismissProposal(p.slug)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                title="Dismiss"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Existing pairings */}
      {pairings.map((pairing) => {
        const other = otherSlug(pairing);
        const isEditing = pairing.id in editingDescriptions;
        const isSaving = saving === pairing.id;

        return (
          <div key={pairing.id} className="rounded-md border border-border p-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setViewModalSlug(other)}
                className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900"
                title="View ingredient"
              >
                <Link2 size={11} />
                {getOtherName(other)}
              </button>
              <span className="text-xs text-muted-foreground font-mono ml-0.5">({other})</span>
              <div className="ml-auto flex gap-1">
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => handleSaveDescription(pairing)}
                    disabled={isSaving}
                    className="text-primary hover:opacity-70"
                    title="Save"
                  >
                    {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(pairing)}
                  disabled={isSaving}
                  className="text-muted-foreground hover:text-destructive"
                  title="Remove pairing"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            {isEditing ? (
              <Textarea
                value={editingDescriptions[pairing.id]}
                onChange={(e) =>
                  setEditingDescriptions((prev) => ({ ...prev, [pairing.id]: e.target.value }))
                }
                rows={2}
                className="text-xs"
                autoFocus
                onBlur={() => handleSaveDescription(pairing)}
              />
            ) : (
              (() => {
                const { text, isFallback } = resolveDescription(pairing, locale);
                return (
                  <div>
                    <p
                      className={cn(
                        "text-xs cursor-text hover:text-foreground",
                        isFallback ? "text-muted-foreground/60 italic" : "text-muted-foreground",
                      )}
                      onClick={() =>
                        setEditingDescriptions((prev) => ({
                          ...prev,
                          [pairing.id]: text,
                        }))
                      }
                      title="Click to edit description"
                    >
                      {text || <span className="italic opacity-50">No description yet</span>}
                    </p>
                    {isFallback && (
                      <p className="text-[10px] text-amber-600 mt-0.5">
                        ⚠ EN fallback — no {locale.toUpperCase()} translation
                      </p>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        );
      })}

      {/* Add new pairing form */}
      {addingNew ? (
        <div className="rounded-md border border-dashed border-border p-2 space-y-2">
          <EntityCombobox
            value={newSlug}
            onChange={setNewSlug}
            options={ingredientOptions.filter(
              (o) => o.value !== currentSlug && !pairings.some((p) => otherSlug(p) === o.value),
            )}
            placeholder="Select ingredient…"
          />
          <Textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Why do these pair well? (required)"
            rows={2}
            className="text-xs"
          />
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={handleAddNew}
              disabled={savingNew || !newSlug || !newDescription.trim()}
            >
              {savingNew ? (
                <Loader2 size={11} className="animate-spin mr-1" />
              ) : (
                <Save size={11} className="mr-1" />
              )}
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setAddingNew(false);
                setNewSlug("");
                setNewDescription("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs w-full"
          onClick={() => setAddingNew(true)}
        >
          <Sparkles size={11} className="mr-1" />
          Add pairing
        </Button>
      )}

      {/* Ingredient view modal */}
      {viewModalSlug && (
        <IngredientLinkModal
          open
          onClose={() => setViewModalSlug(null)}
          mode="view"
          slug={viewModalSlug}
          locale={locale}
          onUnlink={() => {
            const pairing = pairings.find((p) => otherSlug(p) === viewModalSlug);
            if (pairing) void handleDelete(pairing);
            setViewModalSlug(null);
          }}
        />
      )}
    </div>
  );
}
