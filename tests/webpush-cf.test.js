// La implementación de Web Push para Cloudflare (WebCrypto) produce mensajes
// que el navegador puede descifrar y firmas VAPID válidas.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createECDH, randomBytes, createPublicKey, verify } from "node:crypto";
import ece from "http_ece";
import { generateVapidKeys, encryptPayload, sendNotification } from "../cloudflare/webpush.js";

const b64url = (b) => Buffer.from(b).toString("base64url");

function subscriber() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return { ecdh, auth, keys: { p256dh: b64url(ecdh.getPublicKey()), auth: b64url(auth) } };
}

test("el mensaje cifrado se descifra con las claves del navegador (aes128gcm)", async () => {
  const s = subscriber();
  const message = JSON.stringify({ title: "Los Santos · LS-1", body: "Tu pedido va en camino. ¡Ñam!" });
  const body = await encryptPayload({ keys: s.keys }, message);
  const plain = ece.decrypt(Buffer.from(body), {
    version: "aes128gcm",
    privateKey: s.ecdh,
    authSecret: s.keys.auth,
  });
  assert.equal(plain.toString("utf8"), message);
});

test("envía con firma VAPID válida y reporta códigos del proveedor", async () => {
  const keys = await generateVapidKeys();
  assert.match(keys.publicKey, /^[A-Za-z0-9_-]{87}$/);
  assert.match(keys.privateKey, /^[A-Za-z0-9_-]{43}$/);
  let seen;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      seen = { headers: req.headers, body: Buffer.concat(chunks), url: req.url };
      res.statusCode = req.url === "/gone" ? 410 : 201;
      res.end();
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const s = subscriber();
    await sendNotification({ endpoint: base + "/push", keys: s.keys }, "hola", { ...keys, subject: "mailto:a@b.mx", TTL: 60 });
    assert.equal(seen.headers["content-encoding"], "aes128gcm");
    assert.equal(seen.headers.ttl, "60");
    const [, token, k] = seen.headers.authorization.match(/^vapid t=([^,]+), k=(.+)$/);
    assert.equal(k, keys.publicKey);
    const [h, c, sig] = token.split(".");
    const claims = JSON.parse(Buffer.from(c, "base64url"));
    assert.equal(claims.aud, base);
    assert.equal(claims.sub, "mailto:a@b.mx");
    const pub = Buffer.from(keys.publicKey, "base64url");
    const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33)) }, format: "jwk" });
    assert.ok(verify("sha256", Buffer.from(h + "." + c), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url")));
    assert.equal(
      ece.decrypt(seen.body, { version: "aes128gcm", privateKey: s.ecdh, authSecret: s.keys.auth }).toString(),
      "hola",
    );
    await assert.rejects(
      sendNotification({ endpoint: base + "/gone", keys: s.keys }, "x", { ...keys, subject: "mailto:a@b.mx" }),
      (e) => e.statusCode === 410,
    );
  } finally {
    server.close();
  }
});
