"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@careloop/ui/components/toast";

export interface ToastMessage {
  title: string;
  description?: string;
  variant?: "default" | "success" | "destructive";
}

interface QueuedToast extends ToastMessage {
  id: number;
}

const ToastContext = createContext<((toast: ToastMessage) => void) | null>(null);

/** Shows passing notices; translated text comes in from the caller. */
export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<QueuedToast[]>([]);

  const show = useCallback((toast: ToastMessage) => {
    setToasts((current) => [...current, { ...toast, id: Date.now() + Math.random() }]);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      <ToastProvider duration={5000}>
        {children}
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            variant={toast.variant}
            onOpenChange={(open) => {
              if (!open) remove(toast.id);
            }}
          >
            <ToastTitle>{toast.title}</ToastTitle>
            {toast.description ? <ToastDescription>{toast.description}</ToastDescription> : null}
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  );
}

export function useToast(): (toast: ToastMessage) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside a Toaster.");
  return show;
}
