"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { Button, type ButtonProps } from "@careloop/ui/components/button";
import { signOut } from "../lib/api/browser";

export function SignOutButton(props: Omit<ButtonProps, "onClick" | "loading" | "children">) {
  const t = useTranslations("common");
  const [busy, setBusy] = useState(false);
  return (
    <Button
      {...props}
      loading={busy}
      onClick={() => {
        setBusy(true);
        void signOut();
      }}
    >
      {busy ? null : <LogOut aria-hidden="true" />}
      {t("signOut")}
    </Button>
  );
}
