import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@careloop/shared/permissions";
import { getSession } from "../../../lib/api/server";
import { TeamManager } from "./team-manager";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("team");
  return { title: t("title") };
}

/** Owners only. The API enforces the same permission on every team call. */
export default async function TeamPage() {
  const session = await getSession();
  if (!session.active || !can(session.active.roles, "members.manage")) {
    redirect("/not-permitted");
  }
  return <TeamManager currentUserId={session.userId} />;
}
