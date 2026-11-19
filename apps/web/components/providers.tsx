"use client";

import { useMemo, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { UiStringsProvider, type UiStrings } from "@careloop/ui/strings";
import { Toaster } from "./toaster";

/** Fills the UI kit's built-in text from the `ui` messages and mounts the toaster. */
export function Providers({ children }: { children: ReactNode }) {
  const t = useTranslations("ui");
  const strings = useMemo<UiStrings>(
    () => ({
      close: t("close"),
      dismiss: t("dismiss"),
      busy: t("busy"),
      otpCellLabel: (position, total) => t("otpCellLabel", { position, total }),
      openNavigation: t("openNavigation"),
      collapseSidebar: t("collapseSidebar"),
      expandSidebar: t("expandSidebar"),
    }),
    [t],
  );

  return (
    <UiStringsProvider strings={strings}>
      <Toaster>{children}</Toaster>
    </UiStringsProvider>
  );
}
