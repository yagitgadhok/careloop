import { describe, expect, it } from "vitest";
import { ErrorCode } from "@careloop/shared/errors";
import en from "../messages/en.json";
import hi from "../messages/hi.json";

type Catalogue = { [key: string]: string | Catalogue };

/** Every leaf key in a catalogue, as a dotted path. */
function leafKeys(catalogue: Catalogue, prefix = ""): string[] {
  return Object.entries(catalogue).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : leafKeys(value, path);
  });
}

const enKeys = leafKeys(en);
const hiKeys = leafKeys(hi);

describe("message catalogues", () => {
  it("has every English key in Hindi", () => {
    expect(enKeys.filter((key) => !hiKeys.includes(key))).toEqual([]);
  });

  it("has every Hindi key in English", () => {
    expect(hiKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
  });

  it("has an errors.* message for every API error code in both languages", () => {
    const required = Object.values(ErrorCode).map((code) => `errors.${code}`);
    expect(required.filter((key) => !enKeys.includes(key))).toEqual([]);
    expect(required.filter((key) => !hiKeys.includes(key))).toEqual([]);
  });
});
