import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@careloop/ui/components/card";
import { SignOutButton } from "../../../components/sign-out-button";
import { getSession } from "../../../lib/api/server";
import { ClinicPicker } from "./clinic-picker";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("chooseClinic");
  return { title: t("title") };
}

export default async function ChooseClinicPage() {
  const [session, t] = await Promise.all([getSession(), getTranslations("chooseClinic")]);

  return (
    <Card className="gap-6 py-8 shadow-md">
      <CardHeader className="px-6 sm:px-8">
        <CardTitle className="text-2xl tracking-tight">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="px-6 sm:px-8">
        <ClinicPicker
          organisations={session.organisations}
          activeId={session.active?.organisationId ?? null}
        />
      </CardContent>
      <CardFooter className="justify-center px-6 sm:px-8">
        <SignOutButton variant="ghost" size="sm" />
      </CardFooter>
    </Card>
  );
}
