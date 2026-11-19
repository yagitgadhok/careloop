import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ComponentGallery } from "./gallery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false } };

/** Every UI kit component in both themes. Local development only. */
export default async function ComponentsPreviewPage() {
  if (process.env.APP_ENV !== "local") notFound();
  const t = await getTranslations("dev");

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <section aria-label={t("lightTheme")} className="bg-background p-6 text-foreground sm:p-10">
        <ComponentGallery theme="light" />
      </section>
      <section
        aria-label={t("darkTheme")}
        className="dark bg-background p-6 text-foreground sm:p-10"
      >
        <ComponentGallery theme="dark" />
      </section>
    </div>
  );
}
