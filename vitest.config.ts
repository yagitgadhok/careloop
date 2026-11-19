import { defineConfig } from "vitest/config";

// Each package and app owns a vitest config; the root just lists them.
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
  },
});
