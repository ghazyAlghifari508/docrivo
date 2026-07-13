const { spawn, execSync } = require("child_process");

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
  // --webpack: Windows Application Control blocks the native SWC binary
  // (next-swc.win32-x64-msvc.node), so only WASM loads. Turbopack requires
  // native bindings; Webpack runs fine on WASM. Drop this flag once the binary
  // is allowlisted or you're on a machine without the policy.
  spawn("npx", ["next", "dev", "--webpack"], { stdio: "inherit", shell: true });
}, 500);
