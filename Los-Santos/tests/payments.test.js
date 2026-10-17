import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { validSignature } from "../server/payments.js";
test("webhook: valida HMAC y rechaza firma alterada o antigua", () => {
  const prev = process.env.MP_WEBHOOK_SECRET;
  process.env.MP_WEBHOOK_SECRET = "test-only-signature-key";
  try {
    const ts = String(Date.now()),
      id = "123",
      request = "test-request";
    const sign = (t) =>
      createHmac("sha256", process.env.MP_WEBHOOK_SECRET)
        .update(`id:${id};request-id:${request};ts:${t};`)
        .digest("hex");
    const req = {
      query: { "data.id": id },
      headers: {
        "x-request-id": request,
        "x-signature": `ts=${ts},v1=${sign(ts)}`,
      },
    };
    assert.equal(validSignature(req), true);
    assert.equal(
      validSignature({ ...req, query: { "data.id": "456" } }),
      false,
    );
    const old = String(Date.now() - 600000);
    assert.equal(
      validSignature({
        ...req,
        headers: { ...req.headers, "x-signature": `ts=${old},v1=${sign(old)}` },
      }),
      false,
    );
  } finally {
    if (prev === undefined) delete process.env.MP_WEBHOOK_SECRET;
    else process.env.MP_WEBHOOK_SECRET = prev;
  }
});
