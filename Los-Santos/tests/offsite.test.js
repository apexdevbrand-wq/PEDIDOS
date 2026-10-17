import test from "node:test";
import assert from "node:assert/strict";
import { signV4 } from "../server/offsite.js";

// Vector oficial de la documentación de AWS (S3, "GET Object" con Range).
test("firma SigV4 coincide con el ejemplo publicado por AWS", () => {
  const h = signV4({
    method: "GET",
    url: "https://examplebucket.s3.amazonaws.com/test.txt",
    headers: {
      range: "bytes=0-9",
      "x-amz-content-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
    date: new Date("2013-05-24T00:00:00Z"),
  });
  assert.equal(
    h.authorization,
    "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
  );
});

import http from "node:http";
import { fixture } from "./support/server.js";

test("envía respaldo y fotos a un almacenamiento S3 con firma válida", async () => {
  const received = new Map();
  const s3 = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const d = req.headers["x-amz-date"];
      const date = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(9, 11)}:${d.slice(11, 13)}:${d.slice(13, 15)}Z`);
      const expected = signV4({
        method: req.method,
        url: "http://" + req.headers.host + req.url,
        body,
        headers: { "content-type": req.headers["content-type"] },
        accessKeyId: "key",
        secretAccessKey: "secret",
        region: "auto",
        date,
      }).authorization;
      if (req.headers.authorization !== expected) {
        res.statusCode = 403;
        return res.end("SignatureDoesNotMatch");
      }
      received.set(decodeURIComponent(req.url), body);
      res.end();
    });
  });
  await new Promise((r) => s3.listen(0, "127.0.0.1", r));
  const f = await fixture({
    env: {
      BACKUP_S3_ENDPOINT: "http://127.0.0.1:" + s3.address().port,
      BACKUP_S3_BUCKET: "respaldos",
      BACKUP_S3_ACCESS_KEY_ID: "key",
      BACKUP_S3_SECRET_ACCESS_KEY: "secret",
    },
  });
  try {
    await f.start();
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    await fetch(f.base + "/api/staff/uploads", {
      method: "POST",
      headers: { "Content-Type": "image/png", Authorization: "Bearer " + f.owner },
      body: png,
    });
    const r = await f.request("/staff/backups-offsite", "POST", {});
    assert.equal(r.status, 201, await r.clone().text());
    const status = await r.json();
    assert.equal(status.lastError, null);
    const keys = [...received.keys()];
    assert.ok(keys.some((k) => /^\/respaldos\/los-santos\/backups\/(auto|manual)-.*\.sqlite$/.test(k)), keys.join());
    assert.ok(keys.some((k) => /^\/respaldos\/los-santos\/uploads\/[\w-]+\.png$/.test(k)));
    const sqlite = [...received.entries()].find(([k]) => k.endsWith(".sqlite"))[1];
    assert.equal(sqlite.subarray(0, 15).toString(), "SQLite format 3");
    const before = received.size;
    await f.request("/staff/backups-offsite", "POST", {});
    assert.equal(received.size, before + 1, "las fotos ya enviadas no se reenvían");
    assert.equal((await f.request("/staff/backups-offsite", "POST", {}, "staff")).status, 403);
  } finally {
    await f.close();
    s3.close();
  }
});
