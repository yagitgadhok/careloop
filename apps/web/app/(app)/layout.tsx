import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeftRight, Building2 } from "lucide-react";
import { can } from "@careloop/shared/permissions";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@careloop/ui/components/sidebar";
import { Brand } from "../../components/brand";
import { getSession } from "../../lib/api/server";
import { AppSidebar } from "./app-sidebar";
import { UserMenu } from "./user-menu";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session.active) redirect("/choose-clinic");
  const { active } = session;

  const [t, tRoles, format] = await Promise.all([
    getTranslations("header"),
    getTranslations("roles"),
    getFormatter(),
  ]);
  const rolesLabel = format.list(active.roles.map((role) => tRoles(role)));

  return (
    <SidebarProvider>
      <AppSidebar brand={<Brand />} canManageTeam={can(active.roles, "members.manage")} />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-6">
          <SidebarTrigger className="-ml-2" />
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span
              aria-hidden="true"
              className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary sm:flex"
            >
              <Building2 className="size-4" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-xs text-muted-foreground">{t("clinic")}</span>
              <span className="truncate text-sm font-semibold">{active.organisationName}</span>
            </div>
            {session.organisations.length > 1 ? (
              <Link
                href="/choose-clinic"
                className="ml-1 inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-primary outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/60 motion-safe:transition-colors motion-safe:duration-150"
              >
                <ArrowLeftRight aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">{t("switchClinic")}</span>
                <span className="sr-only sm:hidden">{t("switchClinic")}</span>
              </Link>
            ) : null}
          </div>
          <UserMenu rolesLabel={rolesLabel} />
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-8 sm:py-10 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 motion-safe:ease-out">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
