import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface RadioGroupProps {
  children?: ReactNode;
  className?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

interface RadioGroupItemProps {
  value: string;
  id?: string;
  className?: string;
}

export function RadioGroup({
  children,
  className,
  value: _value,
  onValueChange: _onValueChange,
}: RadioGroupProps) {
  return (
    <div className={cn("grid gap-2", className)} role="radiogroup">
      {children}
    </div>
  );
}

export function RadioGroupItem({ value, id, className }: RadioGroupItemProps) {
  return <input type="radio" value={value} id={id} className={cn("h-4 w-4", className)} />;
}
