import { type ReactNode } from "react";
import { cn } from "../../lib/utils";

interface SelectProps {
  children?: ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
}

interface SelectTriggerProps {
  children?: ReactNode;
  className?: string;
  id?: string;
}

interface SelectContentProps {
  children?: ReactNode;
}

interface SelectItemProps {
  value: string;
  children?: ReactNode;
}

interface SelectValueProps {
  placeholder?: string;
}

let _selectOnValueChange: ((v: string) => void) | undefined;
let _selectValue: string | undefined;

export function Select({ children, value, onValueChange }: SelectProps) {
  _selectOnValueChange = onValueChange;
  _selectValue = value;
  return <div data-select="root">{children}</div>;
}

export function SelectTrigger({ children, className, id }: SelectTriggerProps) {
  return (
    <div
      id={id}
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-md border px-3 py-2 text-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SelectValue({ placeholder }: SelectValueProps) {
  return <span data-select="value">{_selectValue ?? placeholder}</span>;
}

export function SelectContent({ children }: SelectContentProps) {
  return <div data-select="content">{children}</div>;
}

export function SelectItem({ value, children }: SelectItemProps) {
  return (
    <div
      data-select-value={value}
      role="option"
      onClick={() => _selectOnValueChange?.(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") _selectOnValueChange?.(value);
      }}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
