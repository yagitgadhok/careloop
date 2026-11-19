"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Building2, ChevronRight, Loader2 } from "lucide-react";
import { ApiError, apiRoutes } from "@careloop/shared/api";
import { ErrorCode } from "@careloop/shared/errors";
import type { OrgChoice } from "@careloop/shared/schemas";
import { Badge } from "@careloop/ui/components/badge";
import { FieldError } from "@careloop/ui/components/input";
import { cn } from "@careloop/ui/lib/cn";
import { useApi } from "../../../lib/api/browser";

export function ClinicPicker({
  organisations,
  activeId,
}: {
  organisations: readonly OrgChoice[];
  activeId: string | null;
}) {
  const t = useTranslations("chooseClinic");
  const tRoles = useTranslations("roles");
  const tErrors = useTranslations("errors");
  const api = useApi();
  const [choosing, setChoosing] = useState<string | null>(null);
  const [problem, setProblem] = useState<ErrorCode | null>(null);

  const choose = async (organisationId: string) => {
    setChoosing(organisationId);
    setProblem(null);
    try {
      await api.request(apiRoutes.auth.selectOrg, { body: { organisationId } });
      window.location.assign("/");
    } catch (error) {
      setProblem(error instanceof ApiError ? error.code : ErrorCode.internal_error);
      setChoosing(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {organisations.map((org) => {
          const active = org.organisationId === activeId;
          const busy = choosing === org.organisationId;
          return (
            <li key={org.organisationId}>
              <button
                type="button"
                disabled={choosing !== null}
                aria-busy={busy || undefined}
                onClick={() => void choose(org.organisationId)}
                className={cn(
                  "group flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-xs outline-none",
                  "hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/60",
                  "disabled:cursor-wait disabled:opacity-70",
                  "motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out",
                  active && "border-primary/50",
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary"
                >
                  <Building2 className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold">{org.organisationName}</span>
                    {active ? <Badge variant="secondary">{t("current")}</Badge> : null}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {org.roles.map((role) => (
                      <Badge key={role} variant="outline">
                        {tRoles(role)}
                      </Badge>
                    ))}
                  </span>
                </span>
                {busy ? (
                  <Loader2
                    aria-hidden="true"
                    className="size-5 text-primary motion-safe:animate-spin"
                  />
                ) : (
                  <ChevronRight
                    aria-hidden="true"
                    className="size-5 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150 group-hover:translate-x-0.5"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {problem ? <FieldError>{tErrors(problem)}</FieldError> : null}
    </div>
  );
}
