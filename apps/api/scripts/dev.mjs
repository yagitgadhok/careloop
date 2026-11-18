// Watch mode without extra dependencies: tsc recompiles src into dist, and
// node --watch restarts the server whenever a compiled file changes.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tscBin = require.resolve("typescript/bin/tsc");

const tsc = spawn(
  process.execPath,
  [tscBin, "-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput"],
  { stdio: ["ignore", "pipe", "inherit"] },
);

let server;
tsc.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  // Start the server after the first compile; node --watch handles later ones.
  if (!server && /Found \d+ errors?\. Watching for file changes/.test(String(chunk))) {
    server = spawn(process.execPath, ["--watch", "dist/main.js"], { stdio: "inherit" });
    server.on("exit", (code) => process.exit(code ?? 0));
  }
});

function stop() {
  tsc.kill();
  server?.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
tsc.on("exit", (code) => {
  server?.kill();
  process.exit(code ?? 0);
});
