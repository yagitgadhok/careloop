"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Dialog as DialogPrimitive, Slot, VisuallyHidden } from "radix-ui";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { cn } from "../lib/cn";
import { useUiStrings } from "../strings";

interface SidebarState {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarState | null>(null);
/** True inside the desktop rail when it is collapsed to icons; the drawer always shows labels. */
const CollapsedContext = createContext(false);

function useSidebar(): SidebarState {
  const state = useContext(SidebarContext);
  if (!state) throw new Error("Sidebar parts must be used inside a SidebarProvider.");
  return state;
}

export function SidebarProvider({
  defaultCollapsed = false,
  className,
  children,
  ...props
}: ComponentProps<"div"> & { defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const value = useMemo(
    () => ({ collapsed, setCollapsed, mobileOpen, setMobileOpen }),
    [collapsed, mobileOpen],
  );
  return (
    <SidebarContext.Provider value={value}>
      <div
        data-slot="sidebar-wrapper"
        className={cn("flex min-h-svh w-full bg-background", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

/** Tailwind's `lg` breakpoint. */
const DESKTOP_QUERY = "(min-width: 1024px)";

const surfaceClasses = "flex h-full flex-col bg-sidebar text-sidebar-foreground";

export interface SidebarProps {
  /** Accessible name of the navigation, for example the product or clinic name. */
  label: string;
  className?: string;
  children: ReactNode;
}

/**
 * From `lg` up, a fixed rail that can collapse to icons.
 * Below `lg`, the same content opens as an off-canvas drawer that traps focus.
 */
export function Sidebar({ label, className, children }: SidebarProps) {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();
  const strings = useUiStrings();

  // At lg the drawer is hidden but its modal dialog would still trap focus and
  // block the page, so close it when the viewport reaches lg.
  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileOpen(false);
    };
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, [setMobileOpen]);

  return (
    <>
      <nav
        data-slot="sidebar"
        data-collapsed={collapsed || undefined}
        aria-label={label}
        className={cn(
          surfaceClasses,
          "sticky top-0 hidden h-svh shrink-0 border-r border-sidebar-border lg:flex",
          collapsed ? "w-16" : "w-64",
          "motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out",
          className,
        )}
      >
        <CollapsedContext.Provider value={collapsed}>{children}</CollapsedContext.Provider>
      </nav>

      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              "fixed inset-0 z-50 bg-black/50 lg:hidden",
              "motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0",
              "motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0",
              "motion-safe:duration-200 motion-safe:ease-out",
            )}
          />
          <DialogPrimitive.Content
            data-slot="sidebar-drawer"
            aria-describedby={undefined}
            className={cn(
              surfaceClasses,
              "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-sidebar-border shadow-lg outline-none lg:hidden",
              "motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:slide-in-from-left",
              "motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:slide-out-to-left",
              "motion-safe:duration-250 motion-safe:ease-out",
            )}
          >
            <VisuallyHidden.Root asChild>
              <DialogPrimitive.Title>{label}</DialogPrimitive.Title>
            </VisuallyHidden.Root>
            <nav aria-label={label} className="flex h-full flex-col">
              <CollapsedContext.Provider value={false}>{children}</CollapsedContext.Provider>
            </nav>
            <DialogPrimitive.Close
              aria-label={strings.close}
              className={cn(
                "absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-md",
                "outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/60",
              )}
            >
              <X aria-hidden="true" className="size-4" />
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

const iconButtonClasses = cn(
  "inline-flex size-11 shrink-0 items-center justify-center rounded-md",
  "outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60",
  "motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out [&_svg]:size-5",
);

/** Opens the navigation drawer. Shown only below `lg`; place it in the top bar. */
export function SidebarTrigger({ className, ...props }: ComponentProps<"button">) {
  const { mobileOpen, setMobileOpen } = useSidebar();
  const strings = useUiStrings();
  return (
    <button
      type="button"
      data-slot="sidebar-trigger"
      aria-label={strings.openNavigation}
      aria-expanded={mobileOpen}
      onClick={() => setMobileOpen(true)}
      className={cn(iconButtonClasses, "lg:hidden", className)}
      {...props}
    >
      <Menu aria-hidden="true" />
    </button>
  );
}

/** Collapses the desktop rail to icons, or expands it again. */
export function SidebarCollapseButton({ className, ...props }: ComponentProps<"button">) {
  const { collapsed, setCollapsed } = useSidebar();
  const strings = useUiStrings();
  return (
    <button
      type="button"
      data-slot="sidebar-collapse"
      aria-label={collapsed ? strings.expandSidebar : strings.collapseSidebar}
      aria-expanded={!collapsed}
      onClick={() => setCollapsed(!collapsed)}
      className={cn(iconButtonClasses, "hidden lg:inline-flex", className)}
      {...props}
    >
      {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
    </button>
  );
}

export function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn("flex min-h-16 items-center gap-2 px-3 pr-14 lg:pr-3", className)}
      {...props}
    />
  );
}

export function SidebarContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-2", className)}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn("flex flex-col gap-2 border-t border-sidebar-border p-2", className)}
      {...props}
    />
  );
}

export function SidebarNav({ className, ...props }: ComponentProps<"ul">) {
  return <ul data-slot="sidebar-nav" className={cn("flex flex-col gap-1", className)} {...props} />;
}

export interface SidebarNavItemProps extends ComponentProps<"a"> {
  /** Decorative icon shown before the label, and alone when the rail is collapsed. */
  icon?: ReactNode;
  /** Marks the current page. */
  active?: boolean;
  /** Render the child (for example a framework Link) instead of an anchor; the child supplies its own icon and label. */
  asChild?: boolean;
}

export function SidebarNavItem({
  icon,
  active = false,
  asChild = false,
  className,
  children,
  onClick,
  ...props
}: SidebarNavItemProps) {
  const { setMobileOpen } = useSidebar();
  const collapsed = useContext(CollapsedContext);
  const Comp = asChild ? Slot.Root : "a";
  return (
    <li>
      <Comp
        data-slot="sidebar-nav-item"
        data-active={active || undefined}
        aria-current={active ? "page" : undefined}
        onClick={(event: MouseEvent<HTMLAnchorElement>) => {
          onClick?.(event);
          setMobileOpen(false);
        }}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium",
          "outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60",
          "data-[active]:bg-sidebar-accent data-[active]:text-sidebar-accent-foreground",
          "motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out",
          "[&_svg]:size-5 [&_svg]:shrink-0",
          collapsed && "justify-center px-0",
          className,
        )}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {icon ? <span aria-hidden="true">{icon}</span> : null}
            <span className={cn("truncate", collapsed && "sr-only")}>{children}</span>
          </>
        )}
      </Comp>
    </li>
  );
}

/** The page area beside the sidebar. */
export function SidebarInset({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-inset"
      className={cn("flex min-w-0 flex-1 flex-col", className)}
      {...props}
    />
  );
}
