"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { cn } from "@careloop/ui/lib/cn";
import { setLocale } from "../lib/i18n/actions";
import { LOCALES, type AppLocale } from "../lib/i18n/locales";

/** Saves the language cookie and re-renders the page in the new language. */
export function useSwitchLocale() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const switchTo = (locale: AppLocale) =>
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });
  return { pending, switchTo };
}

/** A compact two-option toggle, for the sign-in screens. */
export function LanguageToggle({ className }: { className?: string }) {
  const t = useTranslations("language");
  const current = useLocale();
  const { pending, switchTo } = useSwitchLocale();

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      aria-busy={pending || undefined}
      className={cn("inline-flex rounded-lg border bg-card p-1 shadow-xs", className)}
    >
      {LOCALES.map((locale) => {
        const selected = locale === current;
        return (
          <button
            key={locale}
            type="button"
            role="radio"
            aria-checked={selected}
            lang={locale}
            disabled={pending}
            onClick={() => (selected ? undefined : switchTo(locale))}
            className={cn(
              "min-h-9 rounded-md px-3 text-sm font-medium outline-none",
              "focus-visible:ring-[3px] focus-visible:ring-ring/60",
              "motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {t(locale)}
          </button>
        );
      })}
    </div>
  );
}

/** Full-width choices with a description, for the settings page. */
export function LanguageChoices() {
  const t = useTranslations("language");
  const current = useLocale();
  const { pending, switchTo } = useSwitchLocale();

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      aria-busy={pending || undefined}
      className="grid gap-3 sm:grid-cols-2"
    >
      {LOCALES.map((locale) => {
        const selected = locale === current;
        return (
          <button
            key={locale}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={pending}
            onClick={() => (selected ? undefined : switchTo(locale))}
            className={cn(
              "flex min-h-16 items-center justify-between gap-4 rounded-xl border bg-card px-5 py-4 text-left shadow-xs outline-none",
              "focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:opacity-70",
              "motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out",
              selected ? "border-primary ring-1 ring-primary" : "hover:bg-accent/50",
            )}
          >
            <span className="flex flex-col gap-0.5">
              <span lang={locale} className="text-base font-semibold">
                {t(locale)}
              </span>
              <span className="text-sm text-muted-foreground">{t(`${locale}Hint`)}</span>
            </span>
            {selected ? (
              <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check aria-hidden="true" className="size-4" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
