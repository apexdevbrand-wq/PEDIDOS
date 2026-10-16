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
  let child;
  const base = `http://127.0.0.1:${port}`;
  async function start() {
    child = spawn(
      process.execPath,
      [fileURLToPath(new URL("../server/index.js", import.meta.url))],
      {
        cwd: dir,
        env: {
          ...process.env,
          NODE_ENV: "production",
          PORT: String(port),
          STAFF_TOKEN: token,
          MP_ACCESS_TOKEN: "",
          MP_WEBHOOK_SECRET: "",
        },
        stdio: "ignore",
      },
    );
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(base + "/api/catalog")).ok) return;
      } catch {}
      await delay(50);
    }
    throw Error("El servidor no arrancó");
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
        ...(staff ? { Authorization: "Bearer " + token } : {}),
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
    const catalog = await (await request("/catalog")).json();
    assert.equal(catalog.demo, false);
    assert.equal(catalog.digitalPayments, false);
    const body = {
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
        (await request("/staff/orders/" + order.id, "PATCH", { status }))
          .status,
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
    assert.equal((await request("/orders", "POST", body, false)).status, 400);
    assert.equal(
      (await request("/orders", "POST", { ...body, payment: "mp" }, false))
        .status,
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
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
