/**
 * Development entry point: two processes, one database.
 *
 * The web tier (Vite) and the worker are separate processes because the worker
 * is long-lived and blocking -- a Playwright crawl plus an LLM call takes
 * minutes, and it must not share an event loop or a request-scoped database
 * connection pool with the pages people are loading.
 *
 * `npm run dev:web` rather than a bare `vite dev`, so the web command is defined
 * once. An earlier version of this file also passed `--webpack` to force Next off
 * its native compiler; that flag died with Next, and its reason -- Windows
 * Application Control blocking the native SWC binary -- does not apply to Vite,
 * which ships prebuilt JS.
 */
import { spawn, execSync } from "node:child_process";

function killPort(port) {
  try {
    execSync(
      `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }"`,
      { timeout: 3000, stdio: "ignore" },
    );
  } catch {}
}

// A stale Vite or worker from a previous run still holds the port, and the new
// process then fails to bind with an error that looks like a code problem.
killPort(3000);
killPort(8080);

// Small delay so ports are fully released
setTimeout(() => {
  spawn("npx", ["tsx", "watch", "worker/index.ts"], { stdio: "inherit", shell: true });
  spawn("npm", ["run", "dev:web"], { stdio: "inherit", shell: true });
}, 500);
