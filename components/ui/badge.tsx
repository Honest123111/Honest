import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        destructive: "border-transparent bg-destructive/10 text-destructive",
        warning: "border-transparent bg-warning/20 text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  tone,
  style,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants> & { tone?: string | null }) {
  const colored = tone
    ? { backgroundColor: `color-mix(in oklch, ${tone} 16%, transparent)`, color: `color-mix(in oklch, ${tone} 75%, var(--foreground))`, borderColor: "transparent", ...style }
    : style;
  return <span className={cn(badgeVariants({ variant }), className)} style={colored} {...props} />;
}
