import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./support/server.js";

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360f8cf000000030101005d2ccd3e0000000049454e44ae426082",
  "hex",
);

describe("Catálogo administrable desde el panel", () => {
  let f;
  before(async () => {
    f = await fixture();
    await f.start();
  });
  after(async () => f?.close());
  const json = async (r) => ({ status: r.status, body: await r.json() });
  const upload = (bytes, type = "image/png", role = "owner") =>
    fetch(f.base + "/api/staff/uploads", {
      method: "POST",
      headers: {
        "Content-Type": type,
        ...(role ? { Authorization: "Bearer " + (role === "owner" ? f.owner : f.staff) } : {}),
      },
      body: bytes,
    });

  it("crea, edita, archiva y restaura un producto sin perder el historial", async () => {
    const created = await json(
      await f.request("/staff/products", "POST", {
        name: "Torta ahogada",
        category: "La Elotiza",
        price: 9900,
        description: "Con salsa de la casa",
      }),
    );
    assert.equal(created.status, 201);
    const id = created.body.id;
    let catalog = await (await f.request("/catalog", "GET", undefined, null)).json();
    assert.ok(catalog.products.some((p) => p.id === id && p.active));
    assert.ok(catalog.categories.some((c) => c.name === "La Elotiza"));

    const order = await json(
      await f.request("/orders", "POST", f.order({ items: [{ id, quantity: 2 }] }), null),
    );
    assert.equal(order.status, 201);
    assert.equal(order.body.subtotal, 19800);

    assert.equal(
      (await f.request("/staff/products/" + id, "PATCH", { name: "Torta ahogada XL", price: 11900, featured: true })).status,
      200,
    );
    assert.equal(
      (await f.request("/staff/products/" + id, "PATCH", { archived: true })).status,
      200,
    );
    catalog = await (await f.request("/catalog", "GET", undefined, null)).json();
    assert.ok(!catalog.products.some((p) => p.id === id), "archivado no se muestra");
    assert.equal(
      (await f.request("/orders", "POST", f.order({ items: [{ id, quantity: 1 }] }), null)).status,
      400,
      "archivado no se puede comprar",
    );
    const history = await (await f.request("/orders/" + order.body.id, "GET", undefined, null)).json();
    assert.equal(history.lines[0].name, "Torta ahogada");
    assert.equal(history.lines[0].price, 9900);

    const admin = await (await f.request("/staff/catalog")).json();
    assert.ok(admin.products.find((p) => p.id === id).archived);
    assert.equal(
      (await f.request("/staff/products/" + id, "PATCH", { archived: false })).status,
      200,
    );
    catalog = await (await f.request("/catalog", "GET", undefined, null)).json();
    assert.equal(catalog.products.find((p) => p.id === id).name, "Torta ahogada XL");

    await f.stop();
    await f.start();
    const after = await (await f.request("/staff/catalog")).json();
    const saved = after.products.find((p) => p.id === id);
    assert.equal(saved.featured, true);
    assert.equal(saved.price, 11900);
  });

  it("valida datos y permisos del catálogo", async () => {
    for (const body of [
      { name: "", category: "La Elotiza", price: 100 },
      { name: "X", category: "No existe", price: 100 },
      { name: "X", category: "La Elotiza", price: -1 },
      { name: "X", category: "La Elotiza", price: 100, image: "https://evil.example/x.png" },
      { name: "X", category: "La Elotiza", price: 100, image: "/uploads/no-existe.png" },
      { name: "X", category: "La Elotiza", price: 100, hacked: true },
    ])
      assert.equal((await f.request("/staff/products", "POST", body)).status, 400, JSON.stringify(body));
    assert.equal(
      (await f.request("/staff/products", "POST", { name: "X", category: "La Elotiza", price: 1 }, "staff")).status,
      403,
    );
    assert.equal(
      (await f.request("/staff/products", "POST", { name: "X", category: "La Elotiza", price: 1 }, null)).status,
      401,
    );
  });

  it("administra categorías: crear, renombrar, ocultar, ordenar y borrar vacías", async () => {
    const c = await json(await f.request("/staff/categories", "POST", { name: "Postres" }));
    assert.equal(c.status, 201);
    assert.equal((await f.request("/staff/categories", "POST", { name: "postres" })).status, 400);
    const p = await json(
      await f.request("/staff/products", "POST", { name: "Pay de queso", category: "Postres", price: 5500 }),
    );
    assert.equal(
      (await f.request("/staff/categories/" + c.body.id, "PATCH", { name: "Dulces" })).status,
      200,
    );
    let admin = await (await f.request("/staff/catalog")).json();
    assert.equal(admin.products.find((x) => x.id === p.body.id).category, "Dulces");

    assert.equal(
      (await f.request("/staff/categories/" + c.body.id, "PATCH", { active: false })).status,
      200,
    );
    let catalog = await (await f.request("/catalog", "GET", undefined, null)).json();
    assert.ok(!catalog.products.some((x) => x.id === p.body.id));
    assert.ok(!catalog.categories.some((x) => x.id === c.body.id));
    assert.equal(
      (await f.request("/orders", "POST", f.order({ items: [{ id: p.body.id, quantity: 1 }] }), null)).status,
      400,
    );
    assert.equal((await f.request("/staff/categories/" + c.body.id, "DELETE")).status, 409);

    const ids = admin.categories.map((x) => x.id).reverse();
    assert.equal((await f.request("/staff/categories-order", "PUT", { ids })).status, 200);
    admin = await (await f.request("/staff/catalog")).json();
    assert.deepEqual(admin.categories.map((x) => x.id), ids);
    assert.equal((await f.request("/staff/categories-order", "PUT", { ids: ids.slice(1) })).status, 400);

    const empty = await json(await f.request("/staff/categories", "POST", { name: "Temporal" }));
    assert.equal((await f.request("/staff/categories/" + empty.body.id, "DELETE")).status, 200);
  });

  it("sube fotos válidas, rechaza archivos disfrazados y las sirve desde /uploads", async () => {
    const ok = await upload(PNG);
    assert.equal(ok.status, 201);
    const { url } = await ok.json();
    assert.match(url, /^\/uploads\/[\w-]+\.png$/);
    const served = await fetch(f.base + url);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), PNG);
    assert.equal(
      (await f.request("/staff/products/1", "PATCH", { image: url })).status,
      200,
    );
    assert.equal((await upload(Buffer.from("<svg onload=alert(1)>"), "image/png")).status, 400);
    assert.equal((await upload(PNG, "image/svg+xml")).status, 400);
    assert.equal((await upload(PNG, "image/png", "staff")).status, 403);
    assert.equal((await upload(Buffer.alloc(3.5 * 1024 * 1024, 0xff), "image/jpeg")).status, 413);
    assert.equal((await fetch(f.base + "/uploads/../orders.sqlite")).status, 404);
  });
});
