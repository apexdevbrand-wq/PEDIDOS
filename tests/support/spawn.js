// Arranca el servidor para las pruebas de integración.
//   npm test                     → servidor Node (server/index.js)
//   TEST_TARGET=cloudflare …     → Worker + Durable Object con `wrangler dev`
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import net from "node:net";

export const target = process.env.TEST_TARGET === "cloudflare" ? "cloudflare" : "node";
const root = fileURLToPath(new URL("../..", import.meta.url));

export async function freePort() {
  const l = net.createServer();
  await new Promise((r) => l.listen(0, "127.0.0.1", r));
  const port = l.address().port;
  await new Promise((r) => l.close(r));
  return port;
}

export async function spawnServer({ dir, port, env }) {
  if (target === "node")
    return spawn(process.execPath, [fileURLToPath(new URL("../../server/index.js", import.meta.url))], {
      cwd: dir,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
  const vars = Object.entries(env)
    .filter(([k, v]) => v !== "" && v !== undefined && !["PORT", "SERVE_BUILD"].includes(k))
    .flatMap(([k, v]) => ["--var", `${k}:${v}`]);
  return spawn(
    join(root, "node_modules/.bin/wrangler"),
    [
      "dev",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--inspector-port",
      String(await freePort()),
      "--persist-to",
      join(dir, "cloudflare-state"),
      "--log-level",
      "warn",
      "--show-interactive-dev-session=false",
      ...vars,
    ],
    {
      cwd: root,
      detached: true,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

export async function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise((r) => child.once("close", r));
  if (target === "cloudflare")
    try {
      process.kill(-child.pid, "SIGTERM"); // también detiene workerd
    } catch {}
  else child.kill("SIGTERM");
  await done;
}
