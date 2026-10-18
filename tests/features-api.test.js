import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { fixture, target } from "./support/server.js";
describe("Operación completa", () => {
  let f;
  before(async () => {
    f = await fixture();
    await f.start();
  });
  after(async () => f?.close());
  it("un reintento de compra conserva el mismo folio y rechaza cambiar su contenido", async () => {
    const b = f.order();
    const first = await (await f.request("/orders", "POST", b, null)).json();
    const retry = await (await f.request("/orders", "POST", b, null)).json();
    assert.equal(retry.id, first.id);
    assert.equal(
      (await f.request("/orders", "POST", { ...b, name: "Otro" }, null)).status,
      409,
    );
    await f.stop();
    await f.start();
    assert.equal(
      (await (await f.request("/orders", "POST", b, null)).json()).id,
      first.id,
    );
  });
  it("permite pausa y horario, y bloquea pedidos cerrados", async () => {
    assert.equal(
      (await f.request("/staff/settings", "PATCH", { manualClosed: true }))
        .status,
      200,
    );
    try {
      assert.equal(
        (await f.request("/orders", "POST", f.order(), null)).status,
        409,
      );
    } finally {
      await f.request("/staff/settings", "PATCH", { manualClosed: false });
    }
    assert.equal(
      (await f.request("/staff/settings", "PATCH", { defaultPrepMinutes: 999 }))
        .status,
      400,
    );
    assert.equal(
      (
        await f.request(
          "/staff/settings",
          "PATCH",
          { manualClosed: true },
          "staff",
        )
      ).status,
      403,
    );
  });
  it("insumo agotado bloquea varios platillos vinculados sin cambiar precios históricos", async () => {
    assert.equal(
      (
        await f.request("/staff/ingredients/pollo", "PATCH", {
          available: false,
        })
      ).status,
      200,
    );
    try {
      const c = await (
        await f.request("/catalog", "GET", undefined, null)
      ).json();
      assert.equal(c.products.find((p) => p.id === 3).active, false);
      assert.equal(c.products.find((p) => p.id === 4).active, false);
      assert.equal(
        (
          await f.request(
            "/orders",
            "POST",
            f.order({ items: [{ id: 3, quantity: 1 }] }),
            null,
          )
        ).status,
        400,
      );
    } finally {
      await f.request("/staff/ingredients/pollo", "PATCH", { available: true });
    }
  });
  it("aceptar establece tiempo estimado y rechazar exige motivo visible al cliente", async () => {
    let o = await (await f.request("/orders", "POST", f.order(), null)).json();
    assert.equal(
      (
        await f.request(
          "/staff/orders/" + o.id,
          "PATCH",
          { status: "rejected" },
          "staff",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await f.request(
          "/staff/orders/" + o.id,
          "PATCH",
          { status: "cooking", prepMinutes: 35 },
          "staff",
        )
      ).status,
      200,
    );
    o = await (
      await f.request("/orders/" + o.id, "GET", undefined, null)
    ).json();
    assert.ok(new Date(o.estimatedReadyAt) > new Date());
    assert.equal(
      (
        await f.request(
          "/staff/orders/" + o.id,
          "PATCH",
          { status: "rejected", rejectionReason: "Se agotó un insumo" },
          "staff",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await (
          await f.request("/orders/" + o.id, "GET", undefined, null)
        ).json()
      ).rejectionReason,
      "Se agotó un insumo",
    );
  });
  it("WhatsApp es un enlace manual al número mexicano y el ticket escapa texto", async () => {
    const o = await (
      await f.request(
        "/orders",
        "POST",
        f.order({ name: "<script>alert(1)</script>" }),
        null,
      )
    ).json();
    const r = await f.request("/staff/orders/" + o.id + "/whatsapp");
    assert.equal(r.status, 200);
    const w = await r.json();
    assert.match(w.url, /^https:\/\/wa.me\/525512345678\?text=/);
    assert.match(w.message, new RegExp(o.folio));
    const t = await f.request("/staff/orders/" + o.id + "/ticket");
    assert.equal(t.status, 200);
    const html = (await t.json()).html;
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("&lt;script&gt;"));
  });
  it("usuarios individuales, revocación de sesiones, último dueño y auditoría", async () => {
    const r = await f.request("/staff/users", "POST", {
      username: "ana",
      displayName: "Ana cocina",
      password: "Prueba-larga-12345",
      role: "staff",
    });
    assert.equal(r.status, 201);
    const u = await r.json();
    const login = await f.request(
      "/auth/login",
      "POST",
      { username: "ana", password: "Prueba-larga-12345" },
      null,
    );
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    assert.equal((await login.json()).role, "staff");
    assert.equal(
      (
        await fetch(f.base + "/api/staff/orders", {
          headers: { Cookie: cookie },
        })
      ).status,
      200,
    );
    assert.equal(
      (await f.request("/staff/users/" + u.id, "PATCH", { active: false }))
        .status,
      200,
    );
    assert.equal(
      (
        await fetch(f.base + "/api/staff/orders", {
          headers: { Cookie: cookie },
        })
      ).status,
      401,
    );
    const users = await (await f.request("/staff/users")).json();
    assert.ok(!JSON.stringify(users).includes("passwordHash"));
    const owner = users.find((x) => x.role === "owner" && x.active);
    assert.equal(
      (await f.request("/staff/users/" + owner.id, "PATCH", { active: false }))
        .status,
      409,
    );
    const logs = await (await f.request("/staff/audit")).json();
    assert.ok(logs.some((x) => x.action === "user.updated"));
    assert.ok(!JSON.stringify(logs).includes("Prueba-larga"));
  });
  it("corte guarda cobros y diferencia de efectivo con copia de seguridad recuperable", async () => {
    const o = await (
      await f.request("/orders", "POST", f.order(), null)
    ).json();
    for (const status of ["cooking", "ready", "completed"])
      assert.equal(
        (await f.request("/staff/orders/" + o.id, "PATCH", { status }, "staff"))
          .status,
        200,
      );
    const report = await f.request(
      "/staff/reports?date=" +
        new Date().toLocaleDateString("en-CA", {
          timeZone: "America/Mexico_City",
        }),
    );
    assert.equal(report.status, 200);
    assert.ok((await report.json()).cashCollected >= o.total);
    const close = await f.request("/staff/closures", "POST", {
      countedCash: 0,
      notes: "Prueba de corte",
      requestId: crypto.randomUUID(),
    });
    assert.equal(close.status, 201);
    assert.ok((await close.json()).difference < 0);
    assert.equal((await f.request("/staff/backups", "POST", {})).status, 201);
    const backups = await (await f.request("/staff/backups")).json();
    assert.ok(backups.length);
    const download = await f.request("/staff/backups/" + backups[0].name);
    assert.equal(download.status, 200);
    const file = Buffer.from(await download.arrayBuffer());
    if (target === "cloudflare") {
      const data = JSON.parse(file);
      assert.equal(data.format, "los-santos-backup");
      assert.ok(data.tables.orders.some((row) => row.id === o.id));
    } else assert.equal(file.subarray(0, 15).toString(), "SQLite format 3");
    assert.equal(
      (await f.request("/staff/backups", "GET", undefined, "staff")).status,
      403,
    );
  });
  it("push publica solo la clave pública y bloquea endpoints arbitrarios", async () => {
    const key = await f.request("/push/key", "GET", undefined, null);
    assert.equal(key.status, 200);
    const k = await key.json();
    assert.ok(k.publicKey);
    assert.ok(!k.privateKey);
    const o = await (
      await f.request("/orders", "POST", f.order(), null)
    ).json();
    assert.equal(
      (
        await f.request(
          "/orders/" + o.id + "/push",
          "POST",
          {
            endpoint: "https://127.0.0.1/private",
            keys: { p256dh: "x", auth: "x" },
          },
          null,
        )
      ).status,
      400,
    );
  });
});
