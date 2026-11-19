import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Building2 } from "lucide-react";
import { Card, CardContent } from "@careloop/ui/components/card";
import { EmptyState } from "@careloop/ui/components/empty-state";
import { SignOutButton } from "../../../components/sign-out-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("noClinic");
  return { title: t("title") };
}

/** One neutral message whatever the cause, so it reveals nothing about the account. */
export default async function NoClinicPage() {
  const t = await getTranslations("noClinic");
  return (
    <Card className="py-2 shadow-md">
      <CardContent className="px-2">
        <EmptyState
          className="border-0"
          icon={<Building2 />}
          title={t("title")}
          description={t("body")}
          action={<SignOutButton variant="outline" />}
        />
      </CardContent>
    </Card>
  );
}
