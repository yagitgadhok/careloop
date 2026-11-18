import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { Button } from "../src/components/button";
import { renderWithStrings } from "./render";

afterEach(cleanup);

describe("Button", () => {
  it("is disabled and announces a busy state while loading", () => {
    renderWithStrings(<Button loading>Save</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Loading")).toBeTruthy();
  });

  it("is enabled and not busy by default", () => {
    renderWithStrings(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveProperty("disabled", false);
    expect(button.hasAttribute("aria-busy")).toBe(false);
  });
});
