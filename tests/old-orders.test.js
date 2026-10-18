// Los pedidos viejos no se cargan en memoria al arrancar, pero se siguen
// encontrando para seguimiento, reportes y cambios.
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fixture, target } from "./support/server.js";

test("un pedido de hace días se consulta, aparece en el reporte de su fecha y se puede actualizar", { skip: target !== "node" && "requiere acceso directo a la base" }, async () => {
  const f = await fixture();
  try {
    await f.start();
    const o = await (await f.request("/orders", "POST", f.order(), null)).json();
    for (const status of ["cooking", "ready", "completed"])
      assert.equal((await f.request("/staff/orders/" + o.id, "PATCH", { status, ...(status === "cooking" ? { prepMinutes: 10 } : {}) }, "staff")).status, 200);
    await f.stop();
    const old = new Date(Date.now() - 10 * 86400000).toISOString();
    const db = new DatabaseSync(join(f.dir, "data/orders.sqlite"));
    const details = JSON.parse(db.prepare("SELECT details_json FROM orders WHERE id=?").get(o.id).details_json);
    details.paidAt = old;
    details.completedAt = old;
    db.prepare("UPDATE orders SET created_at=?, details_json=? WHERE id=?").run(old, JSON.stringify(details), o.id);
    db.close();
    await f.start();
    const recent = await (await f.request("/staff/orders?recent=1")).json();
    assert.ok(!recent.some((x) => x.id === o.id), "no se envía a Cocina");
    const tracked = await (await f.request("/orders/" + o.id, "GET", undefined, null)).json();
    assert.equal(tracked.status, "completed");
    assert.equal(tracked.lines.length, 1);
    const day = new Date(old).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
    const report = await (await f.request("/staff/reports?date=" + day)).json();
    assert.ok(report.orders.some((x) => x.folio === o.folio));
    const all = await (await f.request("/staff/orders")).json();
    assert.ok(all.some((x) => x.id === o.id));
    // Una suscripción push sobre un pedido viejo sigue funcionando (lo encuentra).
    assert.equal((await f.request("/orders/" + o.id + "/push", "POST", { endpoint: "x" }, null)).status, 400);
    assert.equal((await f.request("/orders/00000000-0000-0000-0000-000000000000", "GET", undefined, null)).status, 404);
  } finally {
    await f.close();
  }
});
