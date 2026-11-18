import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // SWC keeps decorator metadata, which Nest's dependency injection reads.
  plugins: [
    swc.vite({
      module: { type: "es6" },
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    name: "api",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup-env.ts"],
    // The e2e tests share one Postgres and Redis; run files one at a time.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
