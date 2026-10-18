import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { fixture, target } from "./support/server.js";
// Restaurar un archivo .sqlite y migrar bases antiguas solo aplica a Node.
const nodeOnly = { skip: target === "cloudflare" && "solo servidor Node" };
const execute = promisify(execFile);
test("restauración conserva la base anterior y rechaza restaurar con el servidor encendido", nodeOnly, async () => {
  const f = await fixture();
  try {
    await f.start();
    const old = await (
      await f.request("/orders", "POST", f.order(), null)
    ).json();
    const b = await (await f.request("/staff/backups", "POST", {})).json();
    const script = fileURLToPath(
        new URL("../scripts/restore-backup.js", import.meta.url),
      ),
      path = join(f.dir, "data/backups", b.name);
    await assert.rejects(
      () => execute(process.execPath, [script, path], { cwd: f.dir }),
      (e) => /Detén el servidor/.test(e.stderr),
    );
    const newer = await (
      await f.request("/orders", "POST", f.order(), null)
    ).json();
    await f.stop();
    const output = await execute(process.execPath, [script, path], {
      cwd: f.dir,
    });
    assert.match(output.stdout, /verificado y restaurado/);
    await f.start();
    assert.equal(
      (await f.request("/orders/" + old.id, "GET", undefined, null)).status,
      200,
    );
    assert.equal(
      (await f.request("/orders/" + newer.id, "GET", undefined, null)).status,
      404,
    );
    const files = await (await f.request("/staff/backups")).json();
    assert.ok(files.some((b) => b.name.startsWith("manual-before-restore")));
  } finally {
    await f.close();
  }
});
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
test("actualizar desde la versión anterior conserva pedidos y genera respaldo previo", nodeOnly, async () => {
  const f = await fixture();
  try {
    mkdirSync(join(f.dir, "data"));
    const db = new DatabaseSync(join(f.dir, "data/orders.sqlite"));
    db.exec(
      readFileSync(
        new URL("./fixtures/v1-schema.sql", import.meta.url),
        "utf8",
      ),
    );
    db.prepare("INSERT INTO products VALUES(?,?,?,?,?,?,?)").run(
      1,
      "Burger",
      "Hamburguesas",
      99999,
      "Descripción",
      "/images/food-1.jpg",
      1,
    );
    db.prepare("INSERT INTO zones VALUES(?,?,?,?)").run(1, "Centro", 2500, 1);
    db.prepare(
      "INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      "legacy-order",
      "LS-LEGACY",
      "2026-10-15T18:00:00Z",
      "completed",
      "paid",
      "Cliente histórico",
      "5512345678",
      "",
      "Centro",
      "pickup",
      "cash",
      12345,
      0,
      0,
      12345,
      null,
      null,
      null,
      0,
      1,
    );
    db.prepare("INSERT INTO order_items VALUES(?,?,?,?,?,?,?)").run(
      "legacy-order",
      0,
      1,
      "Nombre anterior",
      12345,
      1,
      "Sin cebolla",
    );
    db.close();
    await f.start();
    const o = await (
      await f.request("/orders/legacy-order", "GET", undefined, null)
    ).json();
    assert.equal(o.total, 12345);
    assert.equal(o.lines[0].price, 12345);
    assert.equal(o.lines[0].name, "Nombre anterior");
    const backups = await (await f.request("/staff/backups")).json();
    assert.ok(backups.some((b) => b.name.startsWith("pre-upgrade")));
  } finally {
    await f.close();
  }
});
