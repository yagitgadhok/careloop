import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export const inputClasses = cn(
  "flex min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base shadow-xs md:text-sm",
  "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground",
  "outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/30",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "motion-safe:transition-[color,box-shadow] motion-safe:duration-150 motion-safe:ease-out",
);

export interface InputProps extends ComponentProps<"input"> {
  /** Marks the field invalid. */
  invalid?: boolean;
  /** Id of the element that holds the error message, linked with aria-describedby. */
  errorId?: string;
}

export function Input({
  className,
  type = "text",
  invalid,
  errorId,
  "aria-describedby": describedBy,
  ...props
}: InputProps) {
  const describedByIds =
    [describedBy, invalid ? errorId : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <input
      type={type}
      data-slot="input"
      aria-invalid={invalid || undefined}
      aria-describedby={describedByIds}
      className={cn(inputClasses, className)}
      {...props}
    />
  );
}

/** Error message for a field. Give it the same id passed to the input's `errorId`. */
export function FieldError({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="field-error"
      role="alert"
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    />
  );
}
