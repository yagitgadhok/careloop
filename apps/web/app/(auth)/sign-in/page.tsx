import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@careloop/ui/components/card";
import { SignInForm } from "./sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("signIn");
  return { title: t("title") };
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const { reason } = await searchParams;
  const t = await getTranslations("signIn");

  return (
    <div className="flex flex-col gap-4">
      {reason === "signed_out" ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border bg-card p-4 text-sm shadow-xs"
        >
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>{t("signedOutNotice")}</span>
        </div>
      ) : null}
      <Card className="gap-6 py-8 shadow-md">
        <CardHeader className="px-6 sm:px-8">
          <CardTitle className="text-2xl tracking-tight">{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="px-6 sm:px-8">
          <SignInForm />
        </CardContent>
      </Card>
    </div>
  );
}
