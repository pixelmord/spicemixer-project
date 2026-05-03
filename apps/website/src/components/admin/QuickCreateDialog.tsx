import { useState } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Button } from "@/components/ui/button.tsx";
import { slugify } from "@/lib/slugify.ts";

type EntityKind = "ingredient" | "recipe" | "spicemix" | "sauce";

interface Props {
  open: boolean;
  onClose: () => void;
  kind: EntityKind;
  initialName?: string;
  onCreated: (slug: string, label: string) => void;
}

const INGREDIENT_CATEGORIES = [
  "spice",
  "herb",
  "seed",
  "dried-fruit",
  "salt",
  "acid",
  "allium",
  "other",
] as const;

export default function QuickCreateDialog({
  open,
  onClose,
  kind,
  initialName = "",
  onCreated,
}: Props) {
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(slugify(initialName));
  const [category, setCategory] = useState<string>("spice");
  const [saving, setSaving] = useState(false);

  function handleNameChange(v: string) {
    setName(v);
    if (!slug || slug === slugify(name)) setSlug(slugify(v));
  }

  async function handleCreate() {
    if (!name.trim() || !slug.trim()) return;
    setSaving(true);
    try {
      if (kind === "ingredient") {
        const { error } = await actions.quickCreateIngredient({
          locale: "en",
          slug,
          name,
          category,
        });
        if (error) throw error;
      } else {
        const collection = kind === "recipe" ? "recipes" : "mixtures";
        const { error } = await actions.quickCreateRecipe({ collection, slug, name });
        if (error) throw error;
      }
      toast.success(`Created "${name}"`);
      onCreated(slug, name);
      onClose();
    } catch {
      toast.error("Failed to create");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New {kind}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Cardamom"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Slug *</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="cardamom" />
          </div>
          {kind === "ingredient" && (
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={category} onValueChange={(v) => v && setCategory(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INGREDIENT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter showCloseButton>
          <Button onClick={handleCreate} disabled={saving || !name.trim() || !slug.trim()}>
            {saving && <Loader2 size={14} className="mr-2 animate-spin" />}
            Create stub
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
