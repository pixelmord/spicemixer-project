import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn("flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm", className)}
      {...props}
    />
  );
}
