"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { House, Languages, Users } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarNav,
  SidebarNavItem,
} from "@careloop/ui/components/sidebar";

interface NavEntry {
  href: string;
  label: "home" | "team" | "language";
  icon: ReactNode;
}

export function AppSidebar({
  brand,
  canManageTeam,
}: {
  brand: ReactNode;
  /** Team is listed for owners only; the API enforces the same rule. */
  canManageTeam: boolean;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const entries: NavEntry[] = [
    { href: "/", label: "home", icon: <House aria-hidden="true" /> },
    ...(canManageTeam
      ? [{ href: "/team", label: "team" as const, icon: <Users aria-hidden="true" /> }]
      : []),
  ];

  const renderEntry = (entry: NavEntry) => {
    const active = entry.href === "/" ? pathname === "/" : pathname.startsWith(entry.href);
    return (
      <SidebarNavItem key={entry.href} asChild active={active}>
        <Link href={entry.href}>
          {entry.icon}
          <span className="truncate">{t(entry.label)}</span>
        </Link>
      </SidebarNavItem>
    );
  };

  return (
    <Sidebar label={t("label")}>
      <SidebarHeader className="border-b border-sidebar-border">{brand}</SidebarHeader>
      <SidebarContent className="gap-4 py-4">
        <SidebarNav>{entries.map(renderEntry)}</SidebarNav>
      </SidebarContent>
      <SidebarFooter>
        <SidebarNav>
          {renderEntry({
            href: "/settings/language",
            label: "language",
            icon: <Languages aria-hidden="true" />,
          })}
        </SidebarNav>
      </SidebarFooter>
    </Sidebar>
  );
}
