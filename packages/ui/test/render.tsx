import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { UiStringsProvider, type UiStrings } from "../src/strings";

export const testStrings: UiStrings = {
  close: "Close",
  dismiss: "Dismiss",
  busy: "Loading",
  otpCellLabel: (n, total) => `Digit ${n} of ${total}`,
  openNavigation: "Open navigation",
  collapseSidebar: "Collapse sidebar",
  expandSidebar: "Expand sidebar",
};

export function renderWithStrings(ui: ReactElement) {
  return render(<UiStringsProvider strings={testStrings}>{ui}</UiStringsProvider>);
}
