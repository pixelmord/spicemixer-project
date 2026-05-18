import { cn } from "../lib/utils";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface PresetPickerProps {
  presets: Array<{ id: string; label: string; description?: string }>;
  value?: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function PresetPicker({ presets, value, onSelect, className }: PresetPickerProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor="preset-picker">Preset</Label>
      <Select value={value} onValueChange={onSelect}>
        <SelectTrigger id="preset-picker">
          <SelectValue placeholder="Select a preset…" />
        </SelectTrigger>
        <SelectContent>
          {presets.map((preset) => (
            <SelectItem key={preset.id} value={preset.id}>
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
