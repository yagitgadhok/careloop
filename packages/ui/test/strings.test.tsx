import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../src/components/dialog";
import { renderWithStrings } from "./render";

afterEach(cleanup);

function OpenDialog() {
  return (
    <Dialog open>
      <DialogContent>
        <DialogTitle>Title</DialogTitle>
        <DialogDescription>Body</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

describe("UiStrings", () => {
  it("throws when a Dialog renders without a provider", () => {
    // React logs the thrown render error; keep the test output clean.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<OpenDialog />)).toThrow(/UiStringsProvider/);
    spy.mockRestore();
  });

  it("labels the Dialog close button from the provider", () => {
    renderWithStrings(<OpenDialog />);
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });
});
