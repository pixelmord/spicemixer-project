import { buttonVariants } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import type { VariantProps } from "class-variance-authority";

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

interface Props extends ButtonVariantProps {
  href: string;
  className?: string;
  children: React.ReactNode;
  title?: string;
}

/** Anchor tag styled as a shadcn button (Base-UI button doesn't support asChild). */
export default function LinkButton({ href, variant, size, className, children, title }: Props) {
  return (
    <a href={href} title={title} className={cn(buttonVariants({ variant, size }), className)}>
      {children}
    </a>
  );
}
