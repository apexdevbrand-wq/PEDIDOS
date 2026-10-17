import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./support/server.js";
import { arrival } from "../server/domain.js";
import { orderMessage } from "../server/messages.js";

describe("Tiempo de entrega por colonia", () => {
  let f;
  before(async () => {
    f = await fixture();
    await f.start();
  });
  after(async () => f?.close());

  it("se edita en Administración, se ve en el catálogo y se congela en cada pedido", async () => {
    assert.equal((await f.request("/staff/zones/1", "PATCH", { deliveryMinutes: 0 })).status, 400);
    assert.equal((await f.request("/staff/zones/1", "PATCH", { deliveryMinutes: 181 })).status, 400);
    assert.equal((await f.request("/staff/zones/1", "PATCH", { deliveryMinutes: 35 }, "staff")).status, 403);
    assert.equal((await f.request("/staff/zones/1", "PATCH", { deliveryMinutes: 35 })).status, 200);
    const created = await (await f.request("/staff/zones", "POST", { name: "Nueva Mina", fee: 3500, deliveryMinutes: 25 })).json();
    assert.equal(created.deliveryMinutes, 25);
    let catalog = await (await f.request("/catalog", "GET", undefined, null)).json();
    assert.equal(catalog.zones.find((z) => z.id === 1).deliveryMinutes, 35);

    const o = await (
      await f.request("/orders", "POST", f.order({ delivery: "delivery", zoneId: 1, address: "Calle 1" }), null)
    ).json();
    assert.equal(o.deliveryMinutes, 35);
    const pickup = await (await f.request("/orders", "POST", f.order(), null)).json();
    assert.equal(pickup.deliveryMinutes, null);

    // Cambiar la colonia después no altera lo prometido a este pedido.
    await f.request("/staff/zones/1", "PATCH", { deliveryMinutes: 50 });
    const accepted = await (
      await f.request("/staff/orders/" + o.id, "PATCH", { status: "cooking", prepMinutes: 20 }, "staff")
    ).json();
    const before = arrival(accepted);
    assert.equal(before.minutes, 35);
    assert.equal(before.dispatched, false);
    assert.equal(new Date(before.at) - new Date(accepted.estimatedReadyAt), 35 * 60000);

    const t0 = Date.now();
    const ready = await (await f.request("/staff/orders/" + o.id, "PATCH", { status: "ready" }, "staff")).json();
    assert.ok(new Date(ready.readyAt).getTime() >= t0 - 1000);
    const live = arrival(ready);
    assert.equal(live.dispatched, true);
    assert.equal(new Date(live.at) - new Date(ready.readyAt), 35 * 60000);

    const w = await (await f.request("/staff/orders/" + o.id + "/whatsapp", "GET", undefined, "staff")).json();
    assert.match(w.message, /Llega aproximadamente a las .* \(unos 35 min de camino\)/);

    await f.stop();
    await f.start();
    const saved = await (await f.request("/orders/" + o.id, "GET", undefined, null)).json();
    assert.equal(saved.deliveryMinutes, 35);
    assert.equal(saved.readyAt, ready.readyAt);
    catalog = await (await f.request("/catalog", "GET", undefined, null)).json();
    assert.equal(catalog.zones.find((z) => z.id === 1).deliveryMinutes, 50);
    assert.equal(catalog.zones.find((z) => z.name === "Nueva Mina").deliveryMinutes, 25);
  });
});

it("arrival: solo domicilio, con salida estimada o real", () => {
  const base = { delivery: "delivery", deliveryMinutes: 15, status: "pending" };
  assert.equal(arrival({ ...base, delivery: "pickup" }), null);
  assert.equal(arrival({ ...base, deliveryMinutes: null }), null);
  assert.equal(arrival(base).at, null);
  assert.equal(
    arrival({ ...base, status: "cooking", estimatedReadyAt: "2026-10-17T20:00:00.000Z" }).at,
    "2026-10-17T20:15:00.000Z",
  );
  assert.equal(
    arrival({ ...base, status: "ready", readyAt: "2026-10-17T20:05:00.000Z", estimatedReadyAt: "2026-10-17T20:00:00.000Z" }).at,
    "2026-10-17T20:20:00.000Z",
  );
  assert.equal(arrival({ ...base, status: "completed", readyAt: "2026-10-17T20:05:00.000Z" }).at, null);
  const msg = orderMessage(
    { ...base, status: "cooking", estimatedReadyAt: "2026-10-17T20:00:00.000Z", folio: "LS-1", name: "Ana", total: 1000, paymentStatus: "unpaid" },
    { businessName: "Los Santos", timezone: "America/Mexico_City" },
  );
  assert.match(msg, /Sale del local hacia las 02:00 p\.? ?m\.?; llegada aproximada 02:15 p\.? ?m\.?/i);
});
