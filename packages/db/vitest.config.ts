import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "db",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup-env.ts"],
    // Database tests share one Postgres; run files one at a time.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
