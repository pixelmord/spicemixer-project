import { useState, type ReactNode } from "react";
import { cn } from "../../lib/utils";

interface PopoverProps {
  children?: ReactNode;
}

interface PopoverTriggerProps {
  children?: ReactNode;
  asChild?: boolean;
}

interface PopoverContentProps {
  children?: ReactNode;
  className?: string;
}

let _globalOpen = false;
let _globalSetOpen: (v: boolean) => void = () => {};

export function Popover({ children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  _globalOpen = open;
  _globalSetOpen = setOpen;
  return <div data-popover="root">{children}</div>;
}

export function PopoverTrigger({ children, asChild }: PopoverTriggerProps) {
  return (
    <span
      data-popover="trigger"
      onClick={() => _globalSetOpen(!_globalOpen)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") _globalSetOpen(!_globalOpen);
      }}
    >
      {asChild ? children : <button type="button">{children}</button>}
    </span>
  );
}

export function PopoverContent({ children, className }: PopoverContentProps) {
  return (
    <div
      data-popover="content"
      className={cn("rounded-md border bg-white p-3 shadow-md", className)}
    >
      {children}
    </div>
  );
}
