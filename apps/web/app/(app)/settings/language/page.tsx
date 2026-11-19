import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@careloop/ui/components/page-header";
import { LanguageChoices } from "../../../../components/language-switcher";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settingsLanguage");
  return { title: t("title") };
}

export default async function LanguageSettingsPage() {
  const t = await getTranslations("settingsLanguage");
  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
      <div className="max-w-2xl">
        <LanguageChoices />
      </div>
    </>
  );
}
