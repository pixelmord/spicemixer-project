import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type SimpleWritePolicy = "preserve" | "replace" | "fill-if-empty" | "merge-instructions";

interface WritePolicyPickerProps {
  value: SimpleWritePolicy;
  onChange: (policy: SimpleWritePolicy) => void;
  className?: string;
}

const policies: Array<{ value: SimpleWritePolicy; label: string; description: string }> = [
  {
    value: "preserve",
    label: "Preserve existing",
    description: "Keep current value, ignore suggestion",
  },
  { value: "replace", label: "Replace everything", description: "Overwrite with AI suggestion" },
  {
    value: "fill-if-empty",
    label: "Fill gaps only",
    description: "Apply only when field is empty",
  },
  { value: "merge-instructions", label: "Custom…", description: "Per-field merge instructions" },
];

export function WritePolicyPicker({ value, onChange, className }: WritePolicyPickerProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-sm font-medium">Write policy</p>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as SimpleWritePolicy)}>
        {policies.map((policy) => (
          <div key={policy.value} className="flex items-start gap-2">
            <RadioGroupItem value={policy.value} id={`write-policy-${policy.value}`} />
            <div className="grid gap-0.5">
              <Label htmlFor={`write-policy-${policy.value}`} className="cursor-pointer">
                {policy.label}
              </Label>
              <p className="text-xs text-stone-500">{policy.description}</p>
            </div>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
