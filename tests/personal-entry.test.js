import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./support/server.js";
test("la entrada independiente de personal carga el login sin abrir las rutas privadas", async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.dir, "dist"));
    await writeFile(
      join(f.dir, "dist/index.html"),
      '<!doctype html><html lang="es"><title>Los Santos</title><div id="root"></div></html>',
    );
    await f.start();
    for (const path of ["/", "/personal", "/personal/"]) {
      const r = await fetch(f.base + path);
      assert.equal(r.status, 200);
      assert.match(await r.text(), /Los Santos/);
    }
    assert.equal(
      (await f.request("/staff/orders", "GET", undefined, null)).status,
      401,
    );
  } finally {
    await f.close();
  }
});
