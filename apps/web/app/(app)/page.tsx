import { getTranslations } from "next-intl/server";
import { CalendarClock, ClipboardList, IndianRupee, Stethoscope } from "lucide-react";
import { Badge } from "@careloop/ui/components/badge";
import { EmptyState } from "@careloop/ui/components/empty-state";
import { PageHeader } from "@careloop/ui/components/page-header";
import { getSession } from "../../lib/api/server";

const UPCOMING = [
  { key: "appointments", icon: <CalendarClock /> },
  { key: "patients", icon: <ClipboardList /> },
  { key: "consultations", icon: <Stethoscope /> },
  { key: "billing", icon: <IndianRupee /> },
] as const;

export default async function HomePage() {
  const session = await getSession();
  const [t, tRoles] = await Promise.all([getTranslations("home"), getTranslations("roles")]);
  const active = session.active;
  if (!active) return null;

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={active.organisationName}
        description={t("description")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("yourRoles")}</span>
            {active.roles.map((role) => (
              <Badge key={role} variant="secondary">
                {tRoles(role)}
              </Badge>
            ))}
          </div>
        }
      />
      <section aria-labelledby="coming-soon" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="coming-soon" className="text-lg font-semibold">
            {t("comingSoonTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("comingSoonDescription")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {UPCOMING.map(({ key, icon }) => (
            <EmptyState
              key={key}
              icon={icon}
              title={t(`upcoming.${key}.title`)}
              description={t(`upcoming.${key}.description`)}
              action={<Badge variant="outline">{t("comingSoon")}</Badge>}
              className="bg-card/60 py-10"
            />
          ))}
        </div>
      </section>
    </>
  );
}
