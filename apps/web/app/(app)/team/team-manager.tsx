"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, MoreHorizontal, RefreshCw, UserPlus, Users } from "lucide-react";
import { ApiError, apiRoutes, errorCodeOf } from "@careloop/shared/api";
import { ErrorCode } from "@careloop/shared/errors";
import {
  INVALID_PHONE,
  ROLES,
  toIndianMobile,
  type Membership,
  type Role,
} from "@careloop/shared/schemas";
import { Badge } from "@careloop/ui/components/badge";
import { Button } from "@careloop/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@careloop/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@careloop/ui/components/dropdown-menu";
import { EmptyState } from "@careloop/ui/components/empty-state";
import { FieldError, Input } from "@careloop/ui/components/input";
import { PageHeader } from "@careloop/ui/components/page-header";
import { Skeleton } from "@careloop/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@careloop/ui/components/table";
import { useToast } from "../../../components/toaster";
import { useApi } from "../../../lib/api/browser";

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; members: Membership[] };

/** Inline problems a dialog can show. Anything else falls back to the matching errors.* text. */
type Problem = "invalidPhone" | "alreadyMember" | "rolesRequired" | ErrorCode;

function formatPhone(phone: string): string {
  const match = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return match ? `+91 ${match[1]} ${match[2]}` : phone;
}

/** How a member is named in labels and dialogs: their name, or their phone until one is set. */
function displayName(member: Membership): string {
  return member.name ?? formatPhone(member.phone);
}

function useProblemText() {
  const t = useTranslations("team.problems");
  const tErrors = useTranslations("errors");
  return (problem: Problem) =>
    problem === "invalidPhone" || problem === "alreadyMember" || problem === "rolesRequired"
      ? t(problem)
      : tErrors(problem);
}

export function TeamManager({ currentUserId }: { currentUserId: string }) {
  const t = useTranslations("team");
  const tErrors = useTranslations("errors");
  const api = useApi();
  const toast = useToast();

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<Membership | null>(null);
  const [deactivating, setDeactivating] = useState<Membership | null>(null);

  const load = useCallback(async () => {
    try {
      const { memberships } = await api.request(apiRoutes.memberships.list, {});
      setState({ kind: "ready", members: memberships });
    } catch {
      setState({ kind: "error" });
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  // Your own roles or membership changed: reload so navigation and permissions match.
  const afterChange = async (selfChanged: boolean) => {
    if (selfChanged) window.location.assign("/");
    else await load();
  };

  const reactivate = async (member: Membership) => {
    try {
      await api.request(apiRoutes.memberships.reactivate, {
        params: { membershipId: member.id },
      });
      toast({ title: t("toasts.reactivated"), variant: "success" });
      await load();
    } catch (error) {
      toast({
        title: t("toasts.failed"),
        description: tErrors(errorCodeOf(error)),
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus aria-hidden="true" />
            {t("invite")}
          </Button>
        }
      />

      <TeamMembers
        state={state}
        currentUserId={currentUserId}
        onRetry={() => {
          setState({ kind: "loading" });
          void load();
        }}
        onInvite={() => setInviteOpen(true)}
        onEditRoles={setEditing}
        onDeactivate={setDeactivating}
        onReactivate={(member) => void reactivate(member)}
      />

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={async () => {
          setInviteOpen(false);
          toast({ title: t("toasts.invited"), variant: "success" });
          await load();
        }}
      />
      <RolesDialog
        member={editing}
        isSelf={editing?.userId === currentUserId}
        onClose={() => setEditing(null)}
        onSaved={async (selfChanged) => {
          setEditing(null);
          toast({ title: t("toasts.rolesChanged"), variant: "success" });
          await afterChange(selfChanged);
        }}
      />
      <DeactivateDialog
        member={deactivating}
        onClose={() => setDeactivating(null)}
        onDone={async (selfChanged) => {
          setDeactivating(null);
          toast({ title: t("toasts.deactivated"), variant: "success" });
          await afterChange(selfChanged);
        }}
        isSelf={deactivating?.userId === currentUserId}
      />
    </>
  );
}

/** The member list, or its loading, error or empty state. */
function TeamMembers({
  state,
  currentUserId,
  onRetry,
  onInvite,
  onEditRoles,
  onDeactivate,
  onReactivate,
}: {
  state: LoadState;
  currentUserId: string;
  onRetry: () => void;
  onInvite: () => void;
  onEditRoles: (member: Membership) => void;
  onDeactivate: (member: Membership) => void;
  onReactivate: (member: Membership) => void;
}) {
  const t = useTranslations("team");
  const tRoles = useTranslations("roles");

  if (state.kind === "loading") {
    return (
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4" aria-busy="true">
        <span className="sr-only">{t("loading")}</span>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-center gap-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="ml-auto h-8 w-8" />
          </div>
        ))}
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <EmptyState
        icon={<AlertTriangle />}
        title={t("errorTitle")}
        description={t("errorDescription")}
        action={
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            {t("retry")}
          </Button>
        }
      />
    );
  }
  if (state.members.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title={t("emptyTitle")}
        description={t("emptyDescription")}
        action={
          <Button onClick={onInvite}>
            <UserPlus aria-hidden="true" />
            {t("invite")}
          </Button>
        }
      />
    );
  }
  return (
    <div className="rounded-xl border bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">{t("columns.name")}</TableHead>
            <TableHead>{t("columns.phone")}</TableHead>
            <TableHead>{t("columns.roles")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
            <TableHead className="pr-5 text-right">
              <span className="sr-only">{t("columns.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {state.members.map((member) => {
            const isSelf = member.userId === currentUserId;
            const active = member.status === "active";
            return (
              <TableRow key={member.id} className={active ? undefined : "text-muted-foreground"}>
                <TableCell className="pl-5 font-medium">
                  <span className="flex items-center gap-2">
                    {member.name ?? (
                      <span className="font-normal text-muted-foreground italic">
                        {t("unnamed")}
                      </span>
                    )}
                    {isSelf ? <Badge variant="outline">{t("you")}</Badge> : null}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums">{formatPhone(member.phone)}</TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1">
                    {member.roles.map((role) => (
                      <Badge key={role} variant="secondary">
                        {tRoles(role)}
                      </Badge>
                    ))}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={active ? "success" : "outline"}>
                    {t(`status.${member.status}`)}
                  </Badge>
                </TableCell>
                <TableCell className="pr-5 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("actionsFor", {
                          name: displayName(member),
                        })}
                      >
                        <MoreHorizontal aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {active ? (
                        <>
                          <DropdownMenuItem onSelect={() => onEditRoles(member)}>
                            {t("editRoles")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => onDeactivate(member)}
                          >
                            {t("deactivate")}
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <DropdownMenuItem onSelect={() => onReactivate(member)}>
                          {t("reactivate")}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function RoleCheckboxes({
  value,
  onChange,
  disabled,
  invalid,
  errorId,
}: {
  value: readonly Role[];
  onChange: (roles: Role[]) => void;
  disabled?: boolean;
  invalid?: boolean;
  errorId?: string;
}) {
  const t = useTranslations("team");
  const tRoles = useTranslations("roles");
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? errorId : undefined}
    >
      <legend className="mb-2 text-sm font-medium">{t("rolesLabel")}</legend>
      {ROLES.map((role) => {
        const checked = value.includes(role);
        return (
          <label
            key={role}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 has-checked:border-primary/50 has-checked:bg-secondary/50 has-disabled:cursor-not-allowed has-disabled:opacity-60 motion-safe:transition-colors motion-safe:duration-150"
          >
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={checked}
              disabled={disabled}
              onChange={() =>
                onChange(checked ? value.filter((r) => r !== role) : [...value, role])
              }
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium">{tRoles(role)}</span>
              <span className="text-xs text-muted-foreground">{t(`roleHints.${role}`)}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => Promise<void>;
}) {
  const t = useTranslations("team.inviteDialog");
  const api = useApi();
  const problemText = useProblemText();
  const phoneId = useId();
  const phoneErrorId = useId();
  const rolesErrorId = useId();
  const formErrorId = useId();

  const [phone, setPhone] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    if (open) {
      setPhone("");
      setRoles([]);
      setProblem(null);
      setBusy(false);
    }
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const national = toIndianMobile(phone);
    if (!national) return setProblem("invalidPhone");
    if (roles.length === 0) return setProblem("rolesRequired");
    setBusy(true);
    setProblem(null);
    try {
      await api.request(apiRoutes.memberships.invite, { body: { phone: national, roles } });
      await onInvited();
    } catch (error) {
      if (error instanceof ApiError && error.code === ErrorCode.conflict) {
        setProblem("alreadyMember");
      } else if (
        error instanceof ApiError &&
        error.code === ErrorCode.validation_failed &&
        error.fields?.some((field) => field.path === "phone" || field.code === INVALID_PHONE)
      ) {
        setProblem("invalidPhone");
      } else {
        setProblem(errorCodeOf(error));
      }
    } finally {
      setBusy(false);
    }
  };

  const phoneProblem = problem === "invalidPhone" || problem === "alreadyMember";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label htmlFor={phoneId} className="text-sm font-medium">
              {t("phoneLabel")}
            </label>
            <Input
              id={phoneId}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={t("phonePlaceholder")}
              invalid={phoneProblem}
              errorId={phoneErrorId}
              disabled={busy}
            />
            {phoneProblem && problem ? (
              <FieldError id={phoneErrorId}>{problemText(problem)}</FieldError>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <RoleCheckboxes
              value={roles}
              onChange={(next) => {
                setRoles(next);
                if (problem === "rolesRequired") setProblem(null);
              }}
              disabled={busy}
              invalid={problem === "rolesRequired"}
              errorId={rolesErrorId}
            />
            {problem === "rolesRequired" ? (
              <FieldError id={rolesErrorId}>{problemText(problem)}</FieldError>
            ) : null}
          </div>
          {problem && !phoneProblem && problem !== "rolesRequired" ? (
            <FieldError id={formErrorId}>{problemText(problem)}</FieldError>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" loading={busy}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RolesDialog({
  member,
  isSelf,
  onClose,
  onSaved,
}: {
  member: Membership | null;
  isSelf: boolean;
  onClose: () => void;
  onSaved: (selfChanged: boolean) => Promise<void>;
}) {
  const t = useTranslations("team.rolesDialog");
  const api = useApi();
  const problemText = useProblemText();
  const errorId = useId();

  const [roles, setRoles] = useState<Role[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    if (member) {
      setRoles([...member.roles]);
      setConfirming(false);
      setProblem(null);
      setBusy(false);
    }
  }, [member]);

  if (!member) return null;

  const removesOwner = member.roles.includes("owner") && !roles.includes("owner");

  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await api.request(apiRoutes.memberships.changeRoles, {
        params: { membershipId: member.id },
        body: { roles },
      });
      await onSaved(isSelf);
    } catch (error) {
      setProblem(errorCodeOf(error));
      setConfirming(false);
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (roles.length === 0) return setProblem("rolesRequired");
    // Taking away the owner role is a downgrade, so it asks first.
    if (removesOwner && !confirming) return setConfirming(true);
    void save();
  };

  const name = displayName(member);
  let description: string;
  if (!confirming) description = t("description", { name });
  else if (isSelf) description = t("confirmSelfBody");
  else description = t("confirmBody", { name });

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{confirming ? t("confirmTitle") : t("title")}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {confirming ? null : (
            <RoleCheckboxes
              value={roles}
              onChange={(next) => {
                setRoles(next);
                setProblem(null);
              }}
              disabled={busy}
              invalid={problem === "rolesRequired"}
              errorId={errorId}
            />
          )}
          {problem ? <FieldError id={errorId}>{problemText(problem)}</FieldError> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => (confirming ? setConfirming(false) : onClose())}
              disabled={busy}
            >
              {confirming ? t("back") : t("cancel")}
            </Button>
            <Button type="submit" variant={confirming ? "destructive" : "default"} loading={busy}>
              {confirming ? t("confirm") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeactivateDialog({
  member,
  isSelf,
  onClose,
  onDone,
}: {
  member: Membership | null;
  isSelf: boolean;
  onClose: () => void;
  onDone: (selfChanged: boolean) => Promise<void>;
}) {
  const t = useTranslations("team.deactivateDialog");
  const api = useApi();
  const problemText = useProblemText();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    setBusy(false);
    setProblem(null);
  }, [member]);

  if (!member) return null;

  const confirm = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await api.request(apiRoutes.memberships.deactivate, {
        params: { membershipId: member.id },
      });
      await onDone(isSelf);
    } catch (error) {
      setProblem(errorCodeOf(error));
      setBusy(false);
    }
  };

  const name = displayName(member);

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { name })}</DialogTitle>
          <DialogDescription>{isSelf ? t("selfBody") : t("body")}</DialogDescription>
        </DialogHeader>
        {problem ? <FieldError>{problemText(problem)}</FieldError> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button type="button" variant="destructive" loading={busy} onClick={() => void confirm()}>
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
