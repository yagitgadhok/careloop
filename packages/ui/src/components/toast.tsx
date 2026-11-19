"use client";

import type { ComponentProps } from "react";
import { Toast as ToastPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "../lib/cn";
import { useUiStrings } from "../strings";

// Radix Toast announces toasts politely to screen readers and pauses on hover or focus.
export const ToastProvider = ToastPrimitive.Provider;

export function ToastViewport({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "fixed right-0 bottom-0 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 outline-none sm:max-w-sm",
        className,
      )}
      {...props}
    />
  );
}

const toastVariants = cva(
  [
    "group pointer-events-auto relative flex w-full items-start gap-3 rounded-lg border p-4 pr-12 shadow-lg",
    "data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-(--radix-toast-swipe-end-x) data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x)",
    "motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:slide-in-from-bottom-2",
    "motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0",
    "motion-safe:data-[swipe=end]:animate-out motion-safe:duration-200 motion-safe:ease-out",
  ],
  {
    variants: {
      variant: {
        default: "border-border bg-popover text-popover-foreground",
        success: "border-success/40 bg-popover text-popover-foreground",
        destructive: "border-destructive/50 bg-popover text-popover-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface ToastProps
  extends ComponentProps<typeof ToastPrimitive.Root>, VariantProps<typeof toastVariants> {}

export function Toast({ className, variant, children, ...props }: ToastProps) {
  const strings = useUiStrings();
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(toastVariants({ variant }), className)}
      {...props}
    >
      <div className="grid flex-1 gap-1">{children}</div>
      <ToastPrimitive.Close
        data-slot="toast-close"
        aria-label={strings.dismiss}
        className={cn(
          "absolute top-1 right-1 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground",
          "outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60",
          "motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out",
        )}
      >
        <X aria-hidden="true" className="size-4" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}

export function ToastTitle({ className, ...props }: ComponentProps<typeof ToastPrimitive.Title>) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("text-sm font-semibold", className)}
      {...props}
    />
  );
}

export function ToastDescription({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Description>) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

/** A secondary action on a toast. `altText` describes it for screen readers. */
export function ToastAction({ className, ...props }: ComponentProps<typeof ToastPrimitive.Action>) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      className={cn(
        "mt-2 inline-flex min-h-9 w-fit items-center justify-center rounded-md border px-3 text-sm font-medium",
        "outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/60",
        className,
      )}
      {...props}
    />
  );
}
