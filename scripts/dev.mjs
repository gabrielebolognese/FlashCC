/** Runs the Vite dev server and the drafting server together. */
import { spawn } from "node:child_process";

const procs = [
  spawn("npx", ["vite"], { stdio: "inherit", shell: true }),
  spawn("npx", ["tsx", "watch", "server/index.ts"], { stdio: "inherit", shell: true }),
];

const stop = () => procs.forEach((p) => p.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

for (const p of procs) {
  p.on("exit", (code) => {
    if (code) {
      stop();
      process.exit(code ?? 1);
    }
  });
}
