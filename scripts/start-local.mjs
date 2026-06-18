import { spawn } from "node:child_process";

const host = process.env.LOCAL_HOST || process.env.HOST || "127.0.0.1";
const port = process.env.LOCAL_PORT || process.env.PORT || "4321";
const url = `http://${host}:${port}/`;

console.log(`Starting online-tools at ${url}`);
console.log("Press Ctrl+C to stop.");

const child = spawn(
  "npx",
  ["astro", "dev", "--host", host, "--port", port, "--strictPort"],
  {
    env: {
      ...process.env,
      ASTRO_TELEMETRY_DISABLED: "1",
    },
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
