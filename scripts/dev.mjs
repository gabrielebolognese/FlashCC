/**
 * Runs the Vite dev server and the drafting server together.
 *
 *   npm run dev                     5173, or the next free port
 *   VITE_PORT=4001 npm run dev      4001
 *
 * Passed on the command line rather than only through the environment, so it
 * survives a shell that does not carry env prefixes through npm.
 */
import { spawn } from "node:child_process";

const port = process.env.VITE_PORT;

const procs = [
  spawn("npx", port ? ["vite", "--port", port] : ["vite"], { stdio: "inherit", shell: true }),
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
