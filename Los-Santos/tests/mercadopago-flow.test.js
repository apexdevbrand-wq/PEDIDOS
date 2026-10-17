// Flujo completo de Mercado Pago contra un simulador local de su API:
// preferencia, webhook firmado, consulta manual y reembolso.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHmac } from "node:crypto";
import { fixture } from "./support/server.js";

const SECRET = "simulador-webhook";
describe("Mercado Pago (simulador)", () => {
  let f, mp, mpBase;
  const payments = new Map();
  const preferences = [];
  before(async () => {
    mp = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const url = new URL(req.url, "http://x");
        res.setHeader("Content-Type", "application/json");
        if (req.headers.authorization !== "Bearer TEST-token") {
          res.statusCode = 401;
          return res.end("{}");
        }
        if (req.method === "POST" && url.pathname === "/checkout/preferences") {
          const p = JSON.parse(body);
          preferences.push(p);
          return res.end(
            JSON.stringify({
              id: "pref-" + preferences.length,
              init_point: "https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=x",
            }),
          );
        }
        const m = url.pathname.match(/^\/v1\/payments\/(\w+)$/);
        if (m && payments.has(m[1])) return res.end(JSON.stringify(payments.get(m[1])));
        if (url.pathname === "/v1/payments/search")
          return res.end(
            JSON.stringify({
              results: [...payments.values()].filter(
                (p) => p.external_reference === url.searchParams.get("external_reference"),
              ),
            }),
          );
        res.statusCode = 404;
        res.end("{}");
      });
    });
    await new Promise((r) => mp.listen(0, "127.0.0.1", r));
    mpBase = "http://127.0.0.1:" + mp.address().port;
    f = await fixture({
      env: {
        MP_ACCESS_TOKEN: "TEST-token",
        MP_WEBHOOK_SECRET: SECRET,
        PUBLIC_URL: "https://pedidos.example.test",
        MP_API_BASE: mpBase,
      },
    });
    await f.start();
  });
  after(async () => {
    await f?.close();
    mp?.close();
  });
  const webhook = (id, { secret = SECRET, ts = Date.now() } = {}) => {
    const requestId = "req-" + Math.random();
    const v1 = createHmac("sha256", secret)
      .update(`id:${id};request-id:${requestId};ts:${ts};`)
      .digest("hex");
    return fetch(f.base + "/api/payments/webhook?type=payment&data.id=" + id, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": requestId,
        "x-signature": `ts=${ts},v1=${v1}`,
      },
      body: JSON.stringify({ type: "payment", data: { id } }),
    });
  };

  it("crea la preferencia con el total con recargo y confirma solo por webhook firmado", async () => {
    const r = await f.request("/orders", "POST", f.order({ payment: "mp" }), null);
    assert.equal(r.status, 201);
    const o = await r.json();
    assert.equal(o.surcharge, Math.round(o.subtotal * 0.04));
    assert.match(o.checkoutUrl, /^https:\/\//);
    const pref = preferences.at(-1);
    assert.equal(pref.external_reference, o.id);
    assert.equal(pref.items[0].unit_price, o.total / 100);
    assert.equal(pref.notification_url, "https://pedidos.example.test/api/payments/webhook");

    // Cocina no puede preparar antes del pago.
    assert.equal(
      (await f.request("/staff/orders/" + o.id, "PATCH", { status: "cooking" }, "staff")).status,
      400,
    );
    payments.set("9001", {
      id: 9001,
      status: "approved",
      currency_id: "MXN",
      transaction_amount: o.total / 100,
      external_reference: o.id,
    });
    assert.equal((await webhook("9001", { secret: "otra" })).status, 401);
    assert.equal((await webhook("9001", { ts: Date.now() - 10 * 60000 })).status, 401);
    assert.equal((await webhook("9001")).status, 200);
    let saved = await (await f.request("/orders/" + o.id, "GET", undefined, null)).json();
    assert.equal(saved.paymentStatus, "paid");
    assert.equal(saved.paymentId, "9001");

    // Reembolso total reportado por MP: queda en reportes como devolución.
    payments.set("9001", { ...payments.get("9001"), status: "refunded", transaction_amount_refunded: o.total / 100 });
    assert.equal((await webhook("9001")).status, 200);
    saved = await (await f.request("/orders/" + o.id, "GET", undefined, null)).json();
    assert.equal(saved.paymentStatus, "refunded");
    assert.equal(saved.refundEvents.at(-1).amount, o.total);
  });

  it("rechaza pagos con importe distinto y permite consultar el pago si el webhook no llegó", async () => {
    const o = await (await f.request("/orders", "POST", f.order({ payment: "mp" }), null)).json();
    payments.set("9002", {
      id: 9002,
      status: "approved",
      currency_id: "MXN",
      transaction_amount: 1,
      external_reference: o.id,
    });
    assert.equal((await webhook("9002")).status, 400);
    assert.equal(
      (await (await f.request("/orders/" + o.id, "GET", undefined, null)).json()).paymentStatus,
      "unpaid",
    );
    payments.delete("9002");
    let check = await (await f.request("/staff/orders/" + o.id + "/payment-check", "POST", {}, "staff")).json();
    assert.equal(check.status, null);
    payments.set("9003", {
      id: 9003,
      status: "approved",
      currency_id: "MXN",
      transaction_amount: o.total / 100,
      external_reference: o.id,
    });
    check = await (await f.request("/staff/orders/" + o.id + "/payment-check", "POST", {}, "staff")).json();
    assert.equal(check.status, "approved");
    assert.equal(check.paymentStatus, "paid");
    assert.equal(
      (await f.request("/staff/orders/" + o.id, "PATCH", { status: "cooking", prepMinutes: 20 }, "staff")).status,
      200,
    );
    assert.equal((await f.request("/staff/orders/" + o.id + "/payment-check", "POST", {}, null)).status, 401);
  });
});
