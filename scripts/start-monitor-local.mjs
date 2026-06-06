import { spawn } from "node:child_process";

const children = [
  spawn("npm", ["run", "api:dev"], { stdio: "inherit" }),
  spawn("npm", ["run", "dev"], { stdio: "inherit" }),
];

for (const child of children) {
  child.on("exit", (code, signal) => {
    for (const other of children) {
      if (other.pid && other.exitCode === null) {
        other.kill("SIGTERM");
      }
    }

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}
