interface PillToggleGroupProps<T extends string> {
  options: readonly T[];
  value: readonly T[];
  onChange: (next: T[]) => void;
  getLabel?: (option: T) => string;
  ariaLabel?: string;
}

export function PillToggleGroup<T extends string>({
  options,
  value,
  onChange,
  getLabel,
  ariaLabel,
}: PillToggleGroupProps<T>) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = value.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() =>
              onChange(selected ? value.filter((v) => v !== option) : [...value, option])
            }
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            {getLabel ? getLabel(option) : option}
          </button>
        );
      })}
    </div>
  );
}
