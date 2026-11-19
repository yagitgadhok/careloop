"use client";

import { useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { House, Inbox, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@careloop/ui/components/avatar";
import { Badge } from "@careloop/ui/components/badge";
import { Button } from "@careloop/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@careloop/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@careloop/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@careloop/ui/components/dropdown-menu";
import { EmptyState } from "@careloop/ui/components/empty-state";
import { FieldError, Input } from "@careloop/ui/components/input";
import { OtpInput } from "@careloop/ui/components/otp-input";
import { PageHeader } from "@careloop/ui/components/page-header";
import {
  Sidebar,
  SidebarCollapseButton,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarNav,
  SidebarNavItem,
  SidebarProvider,
  SidebarTrigger,
} from "@careloop/ui/components/sidebar";
import { Skeleton } from "@careloop/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@careloop/ui/components/table";
import { useToast } from "../../../components/toaster";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ComponentGallery({ theme }: { theme: "light" | "dark" }) {
  const t = useTranslations("dev");
  const toast = useToast();
  const errorId = useId();
  const [otp, setOtp] = useState("");
  const [choice, setChoice] = useState("one");

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow={theme === "light" ? t("lightTheme") : t("darkTheme")}
        title={t("title")}
        description={t("description")}
        actions={<Button variant="outline">{t("action")}</Button>}
      />

      <Block title={t("buttons")}>
        <div className="flex flex-wrap gap-2">
          <Button>{t("primary")}</Button>
          <Button variant="secondary">{t("secondary")}</Button>
          <Button variant="outline">{t("outline")}</Button>
          <Button variant="ghost">{t("ghost")}</Button>
          <Button variant="link">{t("link")}</Button>
          <Button variant="destructive">{t("destructive")}</Button>
          <Button loading>{t("loading")}</Button>
          <Button size="sm">{t("small")}</Button>
          <Button size="lg">{t("large")}</Button>
          <Button size="icon" aria-label={t("icon")}>
            <Users aria-hidden="true" />
          </Button>
        </div>
      </Block>

      <Block title={t("badges")}>
        <div className="flex flex-wrap gap-2">
          <Badge>{t("primary")}</Badge>
          <Badge variant="secondary">{t("secondary")}</Badge>
          <Badge variant="success">{t("success")}</Badge>
          <Badge variant="warning">{t("warning")}</Badge>
          <Badge variant="destructive">{t("destructive")}</Badge>
          <Badge variant="outline">{t("outline")}</Badge>
        </div>
      </Block>

      <Block title={t("inputs")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder={t("placeholder")} aria-label={t("placeholder")} />
          <div className="flex flex-col gap-1.5">
            <Input
              placeholder={t("placeholder")}
              aria-label={t("placeholder")}
              invalid
              errorId={errorId}
            />
            <FieldError id={errorId}>{t("fieldError")}</FieldError>
          </div>
        </div>
        <OtpInput value={otp} onChange={setOtp} aria-label={t("otp")} />
      </Block>

      <Block title={t("cardsAndAvatars")}>
        <Card>
          <CardHeader>
            <CardTitle>{t("cardTitle")}</CardTitle>
            <CardDescription>{t("cardDescription")}</CardDescription>
            <CardAction>
              <Avatar>
                <AvatarFallback>{t("initials")}</AvatarFallback>
              </Avatar>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
          <CardFooter>
            <Button size="sm">{t("primary")}</Button>
          </CardFooter>
        </Card>
      </Block>

      <Block title={t("table")}>
        <div className="rounded-xl border bg-card">
          <Table>
            <TableCaption>{t("tableCaption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columnName")}</TableHead>
                <TableHead>{t("columnStatus")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>{t("sampleName")}</TableCell>
                <TableCell>
                  <Badge variant="success">{t("success")}</Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{t("sampleName")}</TableCell>
                <TableCell>
                  <Badge variant="outline">{t("outline")}</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Block>

      <Block title={t("emptyState")}>
        <EmptyState
          icon={<Inbox />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={<Button size="sm">{t("action")}</Button>}
        />
      </Block>

      <Block title={t("overlays")}>
        <div className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">{t("openDialog")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("dialogTitle")}</DialogTitle>
                <DialogDescription>{t("dialogDescription")}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button>{t("primary")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">{t("openMenu")}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>{t("menuLabel")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={choice} onValueChange={setChoice}>
                <DropdownMenuRadioItem value="one">{t("optionOne")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="two">{t("optionTwo")}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem>{t("primary")}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive">{t("destructive")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            onClick={() =>
              toast({ title: t("toastTitle"), description: t("toastBody"), variant: "success" })
            }
          >
            {t("showToast")}
          </Button>
        </div>
      </Block>

      <Block title={t("sidebar")}>
        <SidebarProvider className="min-h-0 overflow-hidden rounded-xl border">
          <Sidebar label={t("sidebar")} className="static h-72">
            <SidebarHeader>
              <span className="truncate font-semibold">{t("sidebar")}</span>
            </SidebarHeader>
            <SidebarContent>
              <SidebarNav>
                <SidebarNavItem href="#" icon={<House />} active>
                  {t("optionOne")}
                </SidebarNavItem>
                <SidebarNavItem href="#" icon={<Users />}>
                  {t("optionTwo")}
                </SidebarNavItem>
              </SidebarNav>
            </SidebarContent>
            <SidebarFooter>
              <SidebarCollapseButton />
            </SidebarFooter>
          </Sidebar>
          <SidebarInset className="h-72 p-4">
            <SidebarTrigger />
            <p className="text-sm text-muted-foreground">{t("sidebarHint")}</p>
          </SidebarInset>
        </SidebarProvider>
      </Block>
    </div>
  );
}
