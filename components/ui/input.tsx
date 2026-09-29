import * as React from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "flex h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-base md:text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(inputClass, className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(inputClass, "h-auto min-h-20 py-2", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

/** Native select: best on phones, styled to match. */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(inputClass, "pr-8", className)} {...props}>
      {children}
    </select>
  ),
);
NativeSelect.displayName = "NativeSelect";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium leading-none", className)} {...props} />;
}

/**
 * Label + control. Wraps the control in a <label> so it is associated for
 * screen readers; use `group` when the field holds several controls.
 */
export function Field({ label, children, hint, className, group }: {
  label: string; children: React.ReactNode; hint?: React.ReactNode; className?: string; group?: boolean;
}) {
  const body = (
    <>
      <span className="text-sm font-medium leading-none">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </>
  );
  return group ? (
    <div role="group" aria-label={label} className={cn("grid gap-1.5", className)}>{body}</div>
  ) : (
    <label className={cn("grid gap-1.5", className)}>{body}</label>
  );
}
