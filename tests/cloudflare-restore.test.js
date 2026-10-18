// Restaurar un respaldo .json desde el panel (solo versión Cloudflare).
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, target } from "./support/server.js";

test("restaura un respaldo .json y vuelve a cargar los datos", { skip: target !== "cloudflare" && "solo Cloudflare" }, async () => {
  const f = await fixture();
  try {
    await f.start();
    const old = await (await f.request("/orders", "POST", f.order(), null)).json();
    assert.equal((await f.request("/staff/backups", "POST", {})).status, 201);
    const [backup] = await (await f.request("/staff/backups")).json();
    const file = await (await f.request("/staff/backups/" + backup.name)).text();
    const newer = await (await f.request("/orders", "POST", f.order(), null)).json();
    await f.request("/staff/products/1", "PATCH", { price: 99900 });
    const restore = (body, role = "owner") =>
      fetch(f.base + "/api/staff/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", ...(role ? { Authorization: "Bearer " + (role === "owner" ? f.owner : f.staff) } : {}) },
        body,
      });
    assert.equal((await restore(file, "staff")).status, 403);
    assert.equal((await restore(file, null)).status, 401);
    assert.equal((await restore("{}")).status, 400);
    const r = await restore(file);
    assert.equal(r.status, 200, await r.clone().text());
    await new Promise((r) => setTimeout(r, 300));
    assert.equal((await f.request("/orders/" + old.id, "GET", undefined, null)).status, 200);
    assert.equal((await f.request("/orders/" + newer.id, "GET", undefined, null)).status, 404);
    const catalog = await (await f.request("/catalog", "GET", undefined, null)).json();
    assert.equal(catalog.products.find((p) => p.id === 1).price, 6000);
    // Cambiar el precio de nuevo al valor de antes sí se guarda.
    assert.equal((await f.request("/staff/products/1", "PATCH", { price: 99900 })).status, 200);
    await f.stop();
    await f.start();
    const after = await (await f.request("/catalog", "GET", undefined, null)).json();
    assert.equal(after.products.find((p) => p.id === 1).price, 99900);
    const list = await (await f.request("/staff/backups")).json();
    assert.ok(list.some((b) => b.name.startsWith("pre-restore")));
  } finally {
    await f.close();
  }
});

test("OWNER_RESET_PASSWORD recupera el acceso del dueño una sola vez", { skip: target !== "cloudflare" && "solo Cloudflare" }, async () => {
  const f = await fixture({ env: { OWNER_RESET_PASSWORD: "RecuperoAcceso2026" } });
  try {
    await f.start();
    const login = (password) =>
      fetch(f.base + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "dueno", password }),
      });
    assert.equal((await login("RecuperoAcceso2026")).status, 200);
    assert.equal((await login("otra-cosa-equivocada")).status, 401);
    // Reiniciar no vuelve a cambiar la cuenta (las sesiones siguen valiendo).
    const r = await login("RecuperoAcceso2026");
    const cookie = r.headers.get("set-cookie").split(";")[0];
    await f.stop();
    await f.start();
    const session = await (await fetch(f.base + "/api/auth/session", { headers: { Cookie: cookie } })).json();
    assert.equal(session.role, "owner");
  } finally {
    await f.close();
  }
});
