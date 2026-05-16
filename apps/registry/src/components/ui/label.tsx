import type { LabelHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children?: ReactNode;
  className?: string;
}

export function Label({ children, className, ...props }: LabelProps) {
  return (
    <label className={cn("text-sm font-medium leading-none", className)} {...props}>
      {children}
    </label>
  );
}
