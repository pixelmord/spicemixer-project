import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Input } from "@/components/ui/input.tsx";
import { TextField } from "@/components/admin/fields/index.ts";
import RecommendedHint from "@/components/admin/RecommendedHint.tsx";
import {
  ISO_DURATION_RE,
  toIsoDuration,
  parseDurationMinutes,
  minutesToIsoDuration,
} from "../recipe-duration.ts";
import type { AnyForm } from "@/components/admin/forms/_shared/form-types.ts";
import type { SiblingLocale } from "@/hooks/use-ai-suggestions";

interface TimingYieldSectionProps {
  form: AnyForm;
  /** Current form values snapshot — needed for totalTime auto-fill. */
  formValues: { prepTime?: string; cookTime?: string; totalTime?: string };
  splitView?: boolean;
  siblingData?: SiblingLocale | null;
  siblingLocale?: string;
}

export function TimingYieldSection({
  form,
  formValues,
  splitView,
  siblingData,
  siblingLocale,
}: TimingYieldSectionProps) {
  return (
    <section id="section-timing" className="scroll-mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Timing &amp; yield</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {(["prepTime", "cookTime", "totalTime"] as const).map((name, idx) => (
            <form.Field key={name} name={name}>
              {(field: any) => {
                const hasValue = !!field.state.value;
                const invalid = hasValue && !ISO_DURATION_RE.test(field.state.value.trim());
                const siblingTimeValue = siblingData?.data[name] as string | undefined;
                const minTotalMin =
                  parseDurationMinutes(formValues.prepTime ?? "") +
                  parseDurationMinutes(formValues.cookTime ?? "");
                const totalTooShort =
                  name === "totalTime" &&
                  minTotalMin > 0 &&
                  hasValue &&
                  !invalid &&
                  parseDurationMinutes(field.state.value) < minTotalMin;
                return (
                  <div className="space-y-1.5">
                    <Label htmlFor={field.name}>
                      {["Prep time", "Cook time", "Total time"][idx]}
                      <RecommendedHint show={!hasValue} />
                    </Label>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={(e) => {
                        const coerced = toIsoDuration(e.target.value);
                        if (coerced !== e.target.value) field.handleChange(coerced);
                        field.handleBlur();
                        // Auto-fill totalTime when it's empty or below prep+cook sum
                        if (name !== "totalTime") {
                          const prep = name === "prepTime" ? coerced : (formValues.prepTime ?? "");
                          const cook = name === "cookTime" ? coerced : (formValues.cookTime ?? "");
                          const sumMin = parseDurationMinutes(prep) + parseDurationMinutes(cook);
                          if (sumMin > 0) {
                            const currentTotal = formValues.totalTime ?? "";
                            if (parseDurationMinutes(currentTotal) < sumMin) {
                              form.setFieldValue(
                                "totalTime" as never,
                                minutesToIsoDuration(sumMin) as never,
                              );
                            }
                          }
                        }
                      }}
                      placeholder={["PT15M", "PT30M", "PT45M"][idx]}
                      className={invalid || totalTooShort ? "border-amber-400" : ""}
                    />
                    {invalid && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Use ISO 8601 format, e.g. PT15M or PT1H30M
                      </p>
                    )}
                    {totalTooShort && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Must be at least {minutesToIsoDuration(minTotalMin)} (prep + cook)
                      </p>
                    )}
                    {splitView && siblingTimeValue && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-xs text-muted-foreground font-mono">
                          {siblingLocale?.toUpperCase()}: {siblingTimeValue}
                        </span>
                        <button
                          type="button"
                          onClick={() => field.handleChange(siblingTimeValue)}
                          className="text-xs text-primary hover:underline"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                  </div>
                );
              }}
            </form.Field>
          ))}
          <form.Field name="recipeYield">
            {(field: any) => (
              <TextField
                field={field}
                label="Yield / servings"
                placeholder="4 servings"
                suggestionPath="recipeYield"
                splitView={splitView}
                siblingValue={siblingData?.data["recipeYield"]}
                siblingLocale={siblingLocale}
                hint={<RecommendedHint show={!field.state.value} />}
              />
            )}
          </form.Field>
        </CardContent>
      </Card>
    </section>
  );
}
