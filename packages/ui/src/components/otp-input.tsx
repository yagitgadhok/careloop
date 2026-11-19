"use client";

import {
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type ComponentProps,
  type KeyboardEvent,
} from "react";
import { cn } from "../lib/cn";
import { useUiStrings } from "../strings";

export interface OtpInputProps extends Omit<
  ComponentProps<"div">,
  "onChange" | "children" | "defaultValue"
> {
  /** The digits entered so far, as one string (for example "1234"). */
  value: string;
  onChange: (value: string) => void;
  /** Number of cells. Defaults to 6. */
  length?: number;
  disabled?: boolean;
  /** Shows the error state on every cell. */
  invalid?: boolean;
  /** Id of the error message, linked to every cell with aria-describedby when invalid. */
  errorId?: string;
  autoFocus?: boolean;
}

/** Spaces and dashes are allowed in pasted codes ("123 456"); anything else is refused. */
function parseDigits(raw: string): string | null {
  const compact = raw.replace(/[\s-]/g, "");
  return /^\d*$/.test(compact) ? compact : null;
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled,
  invalid,
  errorId,
  autoFocus,
  className,
  ...groupProps
}: OtpInputProps) {
  const strings = useUiStrings();
  const cellRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.slice(0, length);
  // Focus moves before React re-renders, so the focus guard reads the newest length from here.
  const filledRef = useRef(digits.length);
  filledRef.current = digits.length;

  const focusCell = (index: number) => {
    const cell = cellRefs.current[Math.max(0, Math.min(index, length - 1))];
    cell?.focus();
    cell?.select();
  };

  /** Writes digits starting at `index`, then focuses the cell after the last one written. */
  const writeFrom = (index: number, incoming: string) => {
    const start = Math.min(index, digits.length);
    const next = (digits.slice(0, start) + incoming + digits.slice(start + incoming.length)).slice(
      0,
      length,
    );
    onChange(next);
    filledRef.current = next.length;
    focusCell(start + incoming.length);
  };

  const handleChange = (index: number) => (event: ChangeEvent<HTMLInputElement>) => {
    const parsed = event.target.value;
    // Typed input must be digits only; anything else leaves the cell unchanged.
    if (!/^\d*$/.test(parsed)) return;
    if (parsed === "") {
      // The cell's digit was deleted (soft keyboards may not send a Backspace key event).
      onChange(digits.slice(0, index) + digits.slice(index + 1));
      return;
    }
    const existing = digits[index];
    let incoming = parsed;
    // Typing into a filled cell gives two characters; keep the new one.
    if (existing !== undefined && parsed.length === 2) {
      incoming = parsed.startsWith(existing) ? parsed.slice(1) : parsed.slice(0, 1);
    }
    // A full code typed or autofilled into one cell fills the input from the start.
    writeFrom(incoming.length >= length ? 0 : index, incoming);
  };

  const handlePaste = (index: number) => (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const parsed = parseDigits(event.clipboardData.getData("text"));
    if (!parsed) return;
    writeFrom(parsed.length >= length ? 0 : index, parsed);
  };

  const handleKeyDown = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index] !== undefined) {
        onChange(digits.slice(0, index) + digits.slice(index + 1));
      } else if (index > 0) {
        onChange(digits.slice(0, index - 1) + digits.slice(index));
        filledRef.current = digits.length - 1;
        focusCell(index - 1);
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusCell(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusCell(Math.min(index + 1, digits.length));
    }
  };

  // Cells fill left to right, so focus never lands past the first empty cell.
  const handleFocus = (index: number) => () => {
    if (index > filledRef.current) focusCell(filledRef.current);
    else cellRefs.current[index]?.select();
  };

  return (
    <div
      role="group"
      data-slot="otp-input"
      className={cn("flex items-center gap-2", className)}
      {...groupProps}
    >
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(node) => {
            cellRefs.current[index] = node;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && index === 0}
          disabled={disabled}
          value={digits[index] ?? ""}
          aria-label={strings.otpCellLabel(index + 1, length)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={handleChange(index)}
          onPaste={handlePaste(index)}
          onKeyDown={handleKeyDown(index)}
          onFocus={handleFocus(index)}
          className={cn(
            "size-12 rounded-md border border-input bg-background text-center text-lg font-semibold tabular-nums shadow-xs",
            "outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "aria-invalid:border-destructive aria-invalid:ring-destructive/30",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "motion-safe:transition-[color,box-shadow,border-color] motion-safe:duration-150 motion-safe:ease-out",
          )}
        />
      ))}
    </div>
  );
}
