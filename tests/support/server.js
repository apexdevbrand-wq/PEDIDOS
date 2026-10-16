import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
export async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "santos-ops-"));
  const listener = net.createServer();
  await new Promise((r) => listener.listen(0, "127.0.0.1", r));
  const port = listener.address().port;
  await new Promise((r) => listener.close(r));
  const owner = randomUUID(),
    staff = randomUUID(),
    base = `http://127.0.0.1:${port}`;
  let child,
    output = "",
    spawnError;
  async function start() {
    output = "";
    spawnError = null;
    child = spawn(
      process.execPath,
      [fileURLToPath(new URL("../../server/index.js", import.meta.url))],
      {
        cwd: dir,
        env: {
          ...process.env,
          NODE_ENV: "production",
          SERVE_BUILD: "1",
          PORT: String(port),
          STAFF_TOKEN: staff,
          OWNER_TOKEN: owner,
          OWNER_PASSWORD: "",
          STAFF_PASSWORD: "",
          MP_ACCESS_TOKEN: "",
          MP_WEBHOOK_SECRET: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (b) => {
        output = (output + b.toString()).slice(-12000);
      });
    child.on("error", (e) => {
      spawnError = e;
    });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (spawnError || child.exitCode !== null || child.signalCode !== null)
        throw Error("Fallo al iniciar: " + (spawnError?.message || output));
      try {
        const r = await fetch(base + "/api/catalog", {
          signal: AbortSignal.timeout(1000),
        });
        if (r.ok) return;
      } catch {}
      await delay(100);
    }
    throw Error("El servidor no respondió en 30 segundos. " + output);
  }
  async function stop() {
    if (child && child.exitCode === null && child.signalCode === null) {
      const done = new Promise((r) => child.once("close", r));
      child.kill();
      await done;
    }
  }
  async function request(path, method = "GET", body, role = "owner") {
    return fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(role
          ? { Authorization: "Bearer " + (role === "owner" ? owner : staff) }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  return {
    dir,
    base,
    owner,
    staff,
    start,
    stop,
    request,
    async close() {
      await stop();
      await rm(dir, { recursive: true, force: true });
    },
    order(overrides = {}) {
      return {
        requestId: randomUUID(),
        name: "Cliente de prueba",
        phone: "5512345678",
        delivery: "pickup",
        payment: "cash",
        items: [{ id: 1, quantity: 1 }],
        ...overrides,
      };
    },
  };
}
