import { getTranslations } from "next-intl/server";
import { cn } from "@careloop/ui/lib/cn";

/** The CareLoop mark and name. */
export async function Brand({ className }: { className?: string }) {
  const t = await getTranslations("common");
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden="true"
        className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-5">
          <path
            d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M8 11h2l1-2 2 4 1-2h2"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span lang="en" className="text-lg font-semibold tracking-tight">
        {t("appName")}
      </span>
    </span>
  );
}
