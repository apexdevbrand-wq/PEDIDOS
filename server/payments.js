import { createHmac, timingSafeEqual } from "node:crypto";
export const paymentsEnabled = () =>
  Boolean(
    process.env.MP_ACCESS_TOKEN &&
    process.env.MP_WEBHOOK_SECRET &&
    process.env.PUBLIC_URL?.startsWith("https://"),
  );
// Solo para pruebas automatizadas: permite un simulador local de la API.
const MP_BASE = /^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.MP_API_BASE || "")
  ? process.env.MP_API_BASE
  : "https://api.mercadopago.com";
async function mp(path, options = {}) {
  const r = await fetch(MP_BASE + path, {
    ...options,
    headers: {
      Authorization: "Bearer " + process.env.MP_ACCESS_TOKEN,
      "Content-Type": "application/json",
      ...options.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok)
    throw Error("No se pudo conectar con Mercado Pago. Intenta nuevamente.");
  return r.json();
}
export async function createPreference(order) {
  if (!paymentsEnabled())
    throw Error("Mercado Pago aún no está conectado. Selecciona efectivo.");
  const base = process.env.PUBLIC_URL.replace(/\/$/, "");
  const p = await mp("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify({
      external_reference: order.id,
      items: [
        {
          id: order.id,
          title: "Los Santos · Pedido " + order.folio,
          quantity: 1,
          currency_id: "MXN",
          unit_price: order.total / 100,
        },
      ],
      back_urls: {
        success: base + "/?payment=return",
        failure: base + "/?payment=return",
        pending: base + "/?payment=return",
      },
      auto_return: "approved",
      statement_descriptor: "LOS SANTOS",
      // La preferencia vence en 30 minutos para no cobrar pedidos viejos.
      expires: true,
      expiration_date_to: new Date(Date.now() + 30 * 60000).toISOString(),
      payer: { name: order.name },
      notification_url: base + "/api/payments/webhook",
    }),
  });
  const url = p.init_point;
  if (!url || new URL(url).protocol !== "https:")
    throw Error("Respuesta inválida de Mercado Pago");
  return { preferenceId: p.id, checkoutUrl: url };
}
export function validSignature(req) {
  const parts = Object.fromEntries(
    String(req.headers["x-signature"] || "")
      .split(",")
      .map((s) => s.trim().split("=")),
  );
  const id = String(req.query["data.id"] || "").toLowerCase();
  const requestId = req.headers["x-request-id"];
  if (
    !id ||
    !requestId ||
    !parts.ts ||
    !parts.v1 ||
    !process.env.MP_WEBHOOK_SECRET
  )
    return false;
  const timestamp = Number(parts.ts);
  const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  if (!Number.isFinite(ms) || Math.abs(Date.now() - ms) > 5 * 60 * 1000)
    return false;
  const digest = createHmac("sha256", process.env.MP_WEBHOOK_SECRET)
    .update(`id:${id};request-id:${requestId};ts:${parts.ts};`)
    .digest("hex");
  return (
    /^[a-f0-9]{64}$/i.test(parts.v1) &&
    timingSafeEqual(Buffer.from(digest), Buffer.from(parts.v1.toLowerCase()))
  );
}
export const fetchPayment = (id) =>
  mp("/v1/payments/" + encodeURIComponent(id));
export async function searchPayments(externalReference) {
  const r = await mp(
    "/v1/payments/search?sort=date_created&criteria=desc&external_reference=" +
      encodeURIComponent(externalReference),
  );
  return (r.results || []).filter(
    (p) => p.external_reference === externalReference,
  );
}
