import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar, SidebarProvider, SidebarTrigger } from "../src/components/sidebar";
import { renderWithStrings } from "./render";

/** A controllable `(min-width: 1024px)` media query; jsdom has no matchMedia. */
function stubDesktopQuery() {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    matches: false,
    media: "(min-width: 1024px)",
    addEventListener: (_: "change", listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_: "change", listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => query),
  );
  return {
    listeners,
    setMatches(matches: boolean) {
      query.matches = matches;
      for (const listener of listeners) listener({ matches } as MediaQueryListEvent);
    },
  };
}

let desktop: ReturnType<typeof stubDesktopQuery>;

beforeEach(() => {
  desktop = stubDesktopQuery();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Harness() {
  return (
    <SidebarProvider>
      <SidebarTrigger />
      <Sidebar label="Made-up clinic">
        <a href="/team">Team</a>
      </Sidebar>
    </SidebarProvider>
  );
}

describe("Sidebar", () => {
  it("closes the mobile drawer when the viewport grows to lg", async () => {
    const user = userEvent.setup();
    renderWithStrings(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    act(() => desktop.setMatches(true));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stops listening when unmounted", () => {
    const { unmount } = renderWithStrings(<Harness />);
    expect(desktop.listeners.size).toBe(1);
    unmount();
    expect(desktop.listeners.size).toBe(0);
  });
});
