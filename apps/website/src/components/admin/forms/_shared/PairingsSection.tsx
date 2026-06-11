import { useState } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Dialog, DialogContent } from "@/components/ui/dialog.tsx";
import {
  CreatePairingDialog,
  type PairingCreationMeta,
} from "@/components/admin/CreatePairingDialog.tsx";
import type { AiEventLog, EntityRef } from "@/hooks/use-ai-suggestions";
import {
  filterVisibleProposals,
  type PairingProposal,
  type PairingListItem,
} from "./pairing-proposals";

export interface PairingsSectionProps {
  entityKind: "ingredient" | "recipe";
  slug: string;
  locale: "en" | "de";
  isNew: boolean;

  proposals: PairingProposal[];
  setProposals: (next: PairingProposal[]) => void;

  dismissed: Set<string>;
  setDismissed: (next: Set<string>) => void;

  featuredPairings: PairingListItem[];
  setFeaturedPairings?: (next: PairingListItem[]) => void;

  /** Optional — when provided, renders a Remove button on each featured pairing row. */
  onRemovePairing?: (id: string, locale: string) => Promise<{ error?: { message: string } }>;

  /** Optional — when provided, renders a "Suggest pairings" button that calls this. */
  onSuggestPairings?: () => Promise<PairingProposal[]>;

  /** Called from CreatePairingDialog. */
  onCreatePairing: (
    locale: string,
    fields: Record<string, unknown>,
    meta: PairingCreationMeta,
  ) => Promise<EntityRef>;

  aiEventLog: AiEventLog;
  runIdSeed: string;
}

export function PairingsSection({
  entityKind,
  slug,
  locale,
  isNew,
  proposals,
  setProposals,
  dismissed,
  setDismissed,
  featuredPairings,
  setFeaturedPairings,
  onRemovePairing,
  onSuggestPairings,
  onCreatePairing,
  aiEventLog,
  runIdSeed,
}: PairingsSectionProps) {
  const [pendingPairingDialog, setPendingPairingDialog] = useState<PairingProposal | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const visibleProposals = filterVisibleProposals(proposals, dismissed, featuredPairings);

  async function handleSuggest() {
    if (!onSuggestPairings) return;
    setSuggesting(true);
    try {
      const next = await onSuggestPairings();
      const existingSlugs = new Set(proposals.map((p) => p.otherSlug));
      const merged = [...proposals, ...next.filter((p) => !existingSlugs.has(p.otherSlug))];
      setProposals(merged);
    } catch (err) {
      toast.error(`Suggest pairings failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSuggesting(false);
    }
  }

  function dismissProposal(otherSlug: string) {
    const next = new Set(dismissed);
    next.add(otherSlug);
    setDismissed(next);
  }

  function splitPairingId(id: string): { locale: string; slug: string } {
    const idx = id.indexOf("/");
    return idx !== -1
      ? { locale: id.slice(0, idx), slug: id.slice(idx + 1) }
      : { locale: "en", slug: id };
  }

  async function handleRemovePairing(p: PairingListItem) {
    if (!onRemovePairing) return;
    const { locale: pairingLocale, slug: pairingSlug } = splitPairingId(p.id);
    if (!window.confirm(`Remove pairing "${pairingSlug}" (${pairingLocale})?`)) return;
    const { error } = await onRemovePairing(pairingSlug, pairingLocale);
    if (error) {
      toast.error(`Remove failed: ${error.message}`);
      return;
    }
    setFeaturedPairings?.(featuredPairings.filter((x) => x.id !== p.id));
    toast.success("Pairing removed");
  }

  return (
    <section id="section-pairings" className="scroll-mt-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Pairings</CardTitle>
            <div className="flex items-center gap-2">
              {visibleProposals.length > 0 && (
                <span className="text-xs text-primary" data-testid="pairings-proposal-count">
                  {visibleProposals.length} AI suggestion
                  {visibleProposals.length !== 1 ? "s" : ""}
                </span>
              )}
              {onSuggestPairings && !isNew && (
                <button
                  type="button"
                  onClick={() => void handleSuggest()}
                  disabled={suggesting}
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
                >
                  <Sparkles size={12} />
                  {suggesting ? "Suggesting…" : "Suggest pairings"}
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {visibleProposals.length > 0 && (
            <div
              className="rounded-md border border-primary/20 bg-primary/5 p-2 space-y-1.5"
              data-testid="pairings-proposals"
            >
              <p className="text-xs font-medium text-muted-foreground mb-1">
                AI suggested pairings
              </p>
              {visibleProposals.map((p) => (
                <div key={p.otherSlug} className="flex items-start gap-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <span className="text-muted-foreground">{p.otherCollection}: </span>
                    <span className="font-medium">{p.otherSlug}</span>
                    {p.rationale && (
                      <p className="text-muted-foreground mt-0.5 truncate">{p.rationale}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label={`Add pairing ${p.otherSlug}`}
                      onClick={() => setPendingPairingDialog(p)}
                      className="flex items-center gap-1 rounded border border-primary/20 px-1.5 py-0.5 text-primary hover:bg-primary/10"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      aria-label={`Dismiss pairing ${p.otherSlug}`}
                      onClick={() => dismissProposal(p.otherSlug)}
                      className="rounded border border-border px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {featuredPairings.length > 0 && (
            <div className="space-y-1" data-testid="pairings-featured">
              <p className="text-xs font-medium text-muted-foreground">
                Pairings featuring this entity
              </p>
              {featuredPairings.map((p) => {
                const { locale: pairingLocale, slug: pairingSlug } = splitPairingId(p.id);
                const editHref = `/admin/pairings/${encodeURIComponent(pairingSlug)}/edit?locale=${pairingLocale}`;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 text-xs rounded border border-border px-2 py-1.5"
                  >
                    <span className="font-medium font-mono">{p.id}</span>
                    {p.description && (
                      <span className="text-muted-foreground truncate">{p.description}</span>
                    )}
                    <a href={editHref} className="ml-auto shrink-0 text-primary hover:underline">
                      Edit
                    </a>
                    {onRemovePairing && (
                      <button
                        type="button"
                        aria-label={`Remove pairing ${p.id}`}
                        onClick={() => void handleRemovePairing(p)}
                        className="shrink-0 rounded border border-border p-1 text-muted-foreground hover:text-destructive hover:bg-muted"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!isNew && featuredPairings.length === 0 && visibleProposals.length === 0 && (
            <p className="text-xs text-muted-foreground">No pairings yet.</p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!pendingPairingDialog}
        onOpenChange={(o) => !o && setPendingPairingDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          {pendingPairingDialog && (
            <CreatePairingDialog
              sourceRef={{ kind: entityKind, id: slug }}
              aiSuggestion={pendingPairingDialog}
              locale={locale}
              onCreate={onCreatePairing}
              onComplete={() => {
                setPendingPairingDialog(null);
                toast.success("Pairing created");
              }}
              aiEventLog={aiEventLog}
              origin={{
                surface: "admin",
                action: "createPairing",
                entityKind,
                userInitiated: true,
                runId: runIdSeed,
                triggeredBy: "editor",
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
