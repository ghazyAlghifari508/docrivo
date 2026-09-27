import { spawn, execSync } from "node:child_process";

function killPort(port) {
  try {
    execSync(
      `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }"`,
      { timeout: 3000, stdio: "ignore" },
    );
  } catch {}
}

killPort(3000);
killPort(8080);

// Small delay so ports are fully released
setTimeout(() => {
  spawn("npx", ["tsx", "watch", "worker/index.ts"], { stdio: "inherit", shell: true });
  spawn("npx", ["vite", "dev"], { stdio: "inherit", shell: true });
}, 500);
