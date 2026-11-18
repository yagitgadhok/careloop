import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OtpInput } from "../src/components/otp-input";
import { renderWithStrings } from "./render";

afterEach(cleanup);

function Harness() {
  const [value, setValue] = useState("");
  return (
    <>
      <OtpInput value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

function cells() {
  return Array.from({ length: 6 }, (_, i) => cell(i));
}

function cell(index: number) {
  return screen.getByRole<HTMLInputElement>("textbox", { name: `Digit ${index + 1} of 6` });
}

describe("OtpInput", () => {
  it("fills all six cells when a code is pasted", async () => {
    const user = userEvent.setup();
    renderWithStrings(<Harness />);
    await user.click(cell(0));
    await user.paste("123456");
    expect(cells().map((c) => c.value)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(screen.getByTestId("value").textContent).toBe("123456");
  });

  it("moves focus back a cell on backspace", async () => {
    const user = userEvent.setup();
    renderWithStrings(<Harness />);
    await user.click(cell(0));
    await user.keyboard("12");
    expect(document.activeElement).toBe(cell(2));
    await user.keyboard("{Backspace}");
    expect(document.activeElement).toBe(cell(1));
    expect(cell(1).value).toBe("");
    expect(screen.getByTestId("value").textContent).toBe("1");
  });

  it("refuses non-digits", async () => {
    const user = userEvent.setup();
    renderWithStrings(<Harness />);
    await user.click(cell(0));
    await user.keyboard("a-");
    expect(cell(0).value).toBe("");
    expect(document.activeElement).toBe(cell(0));
    await user.paste("12ab");
    expect(screen.getByTestId("value").textContent).toBe("");
  });

  it("offers one-time-code autofill and marks the error state", () => {
    renderWithStrings(<OtpInput value="" onChange={() => {}} invalid errorId="otp-error" />);
    const first = cell(0);
    expect(first.getAttribute("autocomplete")).toBe("one-time-code");
    expect(first.getAttribute("aria-invalid")).toBe("true");
    expect(first.getAttribute("aria-describedby")).toBe("otp-error");
  });
});
