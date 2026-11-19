import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Brand } from "../../components/brand";
import { LanguageToggle } from "../../components/language-switcher";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("auth");
  return (
    <div className="relative flex min-h-svh flex-col bg-gradient-to-b from-secondary/70 via-background to-background">
      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-8 sm:py-6">
        <Brand />
        <LanguageToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-md motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-250 motion-safe:ease-out">
          {children}
        </div>
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-muted-foreground">{t("footer")}</footer>
    </div>
  );
}
