import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import net from "node:net";
test("API: autenticación, pedidos, cocina, snapshots y persistencia", async () => {
  const dir = await mkdtemp(join(tmpdir(), "santos-api-"));
  const listener = net.createServer();
  await new Promise((r) => listener.listen(0, "127.0.0.1", r));
  const port = listener.address().port;
  await new Promise((r) => listener.close(r));
  const token = randomUUID();
  const staffToken = randomUUID();
  let child;
  let output = "",
    spawnError;
  const base = `http://127.0.0.1:${port}`;
  async function start(mode = "production", credentials = true) {
    output = "";
    spawnError = null;
    child = spawn(
      process.execPath,
      [fileURLToPath(new URL("../server/index.js", import.meta.url))],
      {
        cwd: dir,
        env: {
          ...process.env,
          NODE_ENV: mode,
          SERVE_BUILD: "1",
          PORT: String(port),
          STAFF_TOKEN: credentials ? staffToken : "",
          OWNER_TOKEN: credentials ? token : "",
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
        throw Error("Fallo de arranque: " + (spawnError?.message || output));
      try {
        if (
          (
            await fetch(base + "/api/catalog", {
              signal: AbortSignal.timeout(1000),
            })
          ).ok
        )
          return;
      } catch {}
      await delay(100);
    }
    throw Error("El servidor no respondió en 30 segundos. " + output);
  }
  async function stop() {
    const proc = child;
    if (proc?.exitCode === null) {
      proc.kill("SIGTERM");
      await new Promise((r) => proc.once("exit", r));
    }
  }
  async function request(path, method = "GET", body, staff = true) {
    return fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(staff
          ? {
              Authorization:
                "Bearer " + (staff === "kitchen" ? staffToken : token),
            }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  try {
    await start();
    assert.equal(
      (await request("/staff/orders", "GET", undefined, false)).status,
      401,
    );
    assert.equal(
      (await request("/staff/orders", "GET", undefined, "kitchen")).status,
      200,
    );
    assert.equal(
      (await request("/staff/products/1", "PATCH", { price: 1 }, "kitchen"))
        .status,
      403,
    );
    assert.equal(
      (
        await request(
          "/staff/zones",
          "POST",
          { name: "Prohibida", fee: 100 },
          "kitchen",
        )
      ).status,
      403,
    );
    assert.equal(
      (await request("/staff/zones/1", "PATCH", { fee: 100 }, "kitchen"))
        .status,
      403,
    );
    assert.equal(
      (await request("/staff/products/1", "PATCH", { price: 1 }, false)).status,
      401,
    );
    const login = await request(
      "/auth/login",
      "POST",
      { token: staffToken, role: "owner" },
      false,
    );
    assert.equal(login.status, 200);
    assert.equal((await login.json()).role, "staff");
    const cookie = login.headers.get("set-cookie").split(";")[0];
    assert.match(login.headers.get("set-cookie"), /HttpOnly/i);
    assert.equal(
      (await fetch(base + "/api/staff/orders", { headers: { Cookie: cookie } }))
        .status,
      200,
    );
    assert.equal(
      (
        await fetch(base + "/api/staff/products/1", {
          method: "PATCH",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ price: 1 }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "/api/auth/logout", {
          method: "POST",
          headers: { Cookie: cookie },
        })
      ).status,
      200,
    );
    assert.equal(
      (await fetch(base + "/api/staff/orders", { headers: { Cookie: cookie } }))
        .status,
      401,
    );
    const ownerLogin = await request("/auth/login", "POST", { token }, false);
    assert.equal(ownerLogin.status, 200);
    assert.equal((await ownerLogin.json()).role, "owner");
    assert.equal(
      (await request("/auth/login", "POST", { token: "incorrect" }, false))
        .status,
      401,
    );
    const publicSession = await request(
      "/auth/session",
      "GET",
      undefined,
      false,
    );
    assert.equal((await publicSession.json()).role, "customer");
    const catalog = await (await request("/catalog")).json();
    assert.equal(catalog.demo, false);
    assert.equal(catalog.digitalPayments, false);
    const body = {
      requestId: randomUUID(),
      name: "Prueba API",
      phone: "5512345678",
      delivery: "delivery",
      zoneId: 1,
      payment: "cash",
      address: "Calle prueba 1",
      items: [{ id: 1, quantity: 2, price: 1, notes: "Sin cebolla" }],
    };
    const response = await request("/orders", "POST", body, false);
    assert.equal(response.status, 201);
    const order = await response.json();
    assert.equal(order.total, 28300);
    assert.equal(order.surcharge, 0);
    assert.equal(order.zoneId, 1);
    assert.equal(
      (
        await request("/staff/orders/" + order.id, "PATCH", {
          status: "completed",
        })
      ).status,
      400,
    );
    for (const status of ["cooking", "ready", "completed"])
      assert.equal(
        (
          await request(
            "/staff/orders/" + order.id,
            "PATCH",
            { status },
            "kitchen",
          )
        ).status,
        200,
      );
    assert.equal(
      (await (await request("/orders/" + order.id)).json()).paymentStatus,
      "paid",
    );
    assert.equal(
      (await request("/staff/products/1", "PATCH", { price: 13900 })).status,
      200,
    );
    assert.equal(
      (await (await request("/orders/" + order.id)).json()).lines[0].price,
      12900,
    );
    assert.equal(
      (await request("/staff/products/1", "PATCH", { active: false })).status,
      200,
    );
    assert.equal(
      (
        await request(
          "/orders",
          "POST",
          { ...body, requestId: randomUUID() },
          false,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/orders",
          "POST",
          { ...body, requestId: randomUUID(), payment: "mp" },
          false,
        )
      ).status,
      400,
    );
    assert.equal(
      (await request("/payments/webhook", "POST", {}, false)).status,
      401,
    );
    await stop();
    await start();
    const saved = await (await request("/orders/" + order.id)).json();
    assert.equal(saved.status, "completed");
    assert.equal(saved.lines[0].notes, "Sin cebolla");
    assert.equal(
      (await (await request("/catalog")).json()).products[0].active,
      false,
    );
    const csrf = await fetch(base + "/api/staff/products/1", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Origin: "https://untrusted.example",
      },
      body: JSON.stringify({ price: 1 }),
    });
    assert.equal(csrf.status, 403);
    await stop();
    await start("development", false);
    assert.equal(
      (await request("/staff/orders", "GET", undefined, false)).status,
      401,
    );
    assert.equal(
      (await request("/staff/products/1", "PATCH", { price: 1 }, false)).status,
      401,
    );
    assert.equal(
      (await request("/auth/login", "POST", { token: staffToken }, false))
        .status,
      401,
    );
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
