"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Built-in text that components render themselves (close buttons, screen-reader
 * labels, busy state). Apps fill this from their i18n catalogue so every word
 * shown to a user is translatable.
 */
export interface UiStrings {
  /** Label of the close button on dialogs and drawers. */
  close: string;
  /** Label of the dismiss button on toasts. */
  dismiss: string;
  /** Screen-reader text announced while a control is busy. */
  busy: string;
  /** Accessible name of one OTP cell, for example "Digit 1 of 6". */
  otpCellLabel: (position: number, total: number) => string;
  /** Label of the button that opens the navigation drawer on small screens. */
  openNavigation: string;
  /** Label of the button that collapses the sidebar. */
  collapseSidebar: string;
  /** Label of the button that expands a collapsed sidebar. */
  expandSidebar: string;
}

const UiStringsContext = createContext<UiStrings | null>(null);

export function UiStringsProvider({
  strings,
  children,
}: {
  strings: UiStrings;
  children: ReactNode;
}) {
  return <UiStringsContext.Provider value={strings}>{children}</UiStringsContext.Provider>;
}

/** Returns the built-in strings. Throws if no UiStringsProvider is mounted. */
export function useUiStrings(): UiStrings {
  const strings = useContext(UiStringsContext);
  if (!strings) {
    throw new Error("useUiStrings must be used inside a UiStringsProvider.");
  }
  return strings;
}
