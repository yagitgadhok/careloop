"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Languages, LogOut, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@careloop/ui/components/dropdown-menu";
import { useSwitchLocale } from "../../components/language-switcher";
import { signOut } from "../../lib/api/browser";
import { isLocale, LOCALES } from "../../lib/i18n/locales";

export function UserMenu({ rolesLabel }: { rolesLabel: string }) {
  const t = useTranslations("userMenu");
  const tLanguage = useTranslations("language");
  const locale = useLocale();
  const { switchTo } = useSwitchLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("open")}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1 text-sm font-medium shadow-xs outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/60 motion-safe:transition-colors motion-safe:duration-150"
      >
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-secondary text-primary"
        >
          <UserRound className="size-4" />
        </span>
        <span className="hidden max-w-40 truncate sm:inline">{rolesLabel}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>{tLanguage("label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) => {
            if (isLocale(value) && value !== locale) switchTo(value);
          }}
        >
          {LOCALES.map((option) => (
            <DropdownMenuRadioItem key={option} value={option} lang={option}>
              {tLanguage(option)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuItem asChild>
          <Link href="/settings/language">
            <Languages aria-hidden="true" />
            {t("languageSettings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
          <LogOut aria-hidden="true" />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
