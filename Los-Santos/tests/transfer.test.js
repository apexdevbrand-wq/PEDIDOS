import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./support/server.js";

describe("Pago por transferencia", () => {
  let f;
  before(async () => {
    f = await fixture();
    await f.start();
  });
  after(async () => f?.close());

  it("solo se ofrece con datos bancarios y Cocina confirma antes de preparar", async () => {
    assert.equal((await f.request("/orders", "POST", f.order({ payment: "transfer" }), null)).status, 400);
    assert.equal((await f.request("/staff/settings", "PATCH", { transferClabe: "123" })).status, 400);
    assert.equal((await f.request("/staff/settings", "PATCH", { receiptWhatsapp: "92148" })).status, 400);
    assert.equal(
      (
        await f.request("/staff/settings", "PATCH", {
          transferBank: "BBVA",
          transferHolder: "Los Santos",
          transferClabe: "012345678901234567",
        })
      ).status,
      200,
    );
    const catalog = await (await f.request("/catalog", "GET", undefined, null)).json();
    assert.equal(catalog.settings.receiptWhatsapp, "9214899319");
    assert.equal(catalog.digitalPayments, false);

    const o = await (await f.request("/orders", "POST", f.order({ payment: "transfer" }), null)).json();
    assert.equal(o.payment, "transfer");
    assert.equal(o.surcharge, 0);
    assert.equal(o.paymentStatus, "unpaid");
    assert.equal(
      (await f.request("/staff/orders/" + o.id, "PATCH", { status: "cooking", prepMinutes: 10 }, "staff")).status,
      400,
    );
    assert.equal((await f.request("/staff/orders/" + o.id + "/confirm-transfer", "POST", {}, null)).status, 401);
    const paid = await (await f.request("/staff/orders/" + o.id + "/confirm-transfer", "POST", {}, "staff")).json();
    assert.equal(paid.paymentStatus, "paid");
    assert.equal((await f.request("/staff/orders/" + o.id + "/confirm-transfer", "POST", {}, "staff")).status, 409);
    assert.equal(
      (await f.request("/staff/orders/" + o.id, "PATCH", { status: "cooking", prepMinutes: 10 }, "staff")).status,
      200,
    );
    const rejected = await (
      await f.request("/staff/orders/" + o.id, "PATCH", { status: "rejected", rejectionReason: "Se acabó" }, "staff")
    ).json();
    assert.equal(rejected.refundRequired, true);

    const cash = await (await f.request("/orders", "POST", f.order(), null)).json();
    assert.equal((await f.request("/staff/orders/" + cash.id + "/confirm-transfer", "POST", {}, "staff")).status, 400);

    const report = await (await f.request("/staff/reports")).json();
    assert.equal(report.transferCollected, o.total);
    const csv = await (await f.request("/staff/reports?format=csv")).text();
    assert.match(csv, /Transferencia/);
    const w = await (await f.request("/staff/orders/" + cash.id + "/whatsapp", "GET", undefined, "staff")).json();
    assert.doesNotMatch(w.message, /transferencia/i);
  });
});
