import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  className?: string;
  variant?: "default" | "ghost" | "outline" | "destructive";
  size?: "default" | "sm" | "icon";
  asChild?: boolean;
}

export function Button({
  children,
  className,
  asChild: _asChild,
  variant: _variant,
  size: _size,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
