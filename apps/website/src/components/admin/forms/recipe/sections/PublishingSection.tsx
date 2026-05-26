import { Languages } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Label } from "@/components/ui/label.tsx";
import { TagInputField } from "@/components/admin/fields/index.ts";
import type { AnyForm } from "@/components/admin/forms/_shared/form-types.ts";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "de", label: "German" },
] as const;

interface PublishingSectionProps {
  form: AnyForm;
  tagSuggestions: string[];
  language: string | undefined;
  setLanguage: (lang: string) => void;
  detectedLanguage?: string;
  translations?: Record<string, string>;
  collection: string;
}

export function PublishingSection({
  form,
  tagSuggestions,
  language,
  setLanguage,
  detectedLanguage,
  translations,
  collection,
}: PublishingSectionProps) {
  return (
    <section id="section-publishing" className="scroll-mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Publishing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form.Field name="tags">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(field: any) => (
              <TagInputField
                field={field}
                label="Tags"
                placeholder="weeknight, make-ahead"
                suggestions={tagSuggestions}
                suggestionPath="tags"
              />
            )}
          </form.Field>
          <div className="space-y-1.5">
            <Label>Language</Label>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center rounded-md border border-border bg-muted px-2.5 py-1.5 text-sm font-medium text-muted-foreground"
                aria-label="Current language (read-only)"
              >
                {language ? (LANGUAGES.find((l) => l.value === language)?.label ?? language) : "—"}
              </span>
              {language && (
                <span className="text-xs font-mono text-muted-foreground/60 select-none">
                  {language.toUpperCase()}
                </span>
              )}
            </div>
            {/* Show detected language suggestion */}
            {!language && detectedLanguage && (
              <button
                type="button"
                onClick={() => setLanguage(detectedLanguage)}
                className="text-xs text-primary hover:underline"
              >
                ✦ AI detected: {detectedLanguage}
              </button>
            )}
            {/* Show linked translations */}
            {translations && Object.entries(translations).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(translations).map(([locale, tSlug]) => (
                  <a
                    key={locale}
                    href={`/admin/${collection}/${tSlug}/edit`}
                    className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  >
                    <Languages size={9} />
                    {locale}: {tSlug}
                  </a>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
