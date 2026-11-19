import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { Button } from "@careloop/ui/components/button";
import { EmptyState } from "@careloop/ui/components/empty-state";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notPermitted");
  return { title: t("title") };
}

export default async function NotPermittedPage() {
  const t = await getTranslations("notPermitted");
  return (
    <EmptyState
      className="mt-8 bg-card/60"
      icon={<ShieldAlert />}
      title={t("title")}
      description={t("body")}
      action={
        <Button asChild variant="outline">
          <Link href="/">{t("backHome")}</Link>
        </Button>
      }
    />
  );
}
