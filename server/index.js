import "./instance.js";
import { resolve } from "node:path";
import express from "express";
import {
  paymentsEnabled,
  createPreference,
  validSignature,
  fetchPayment,
} from "./payments.js";
import { load, save as persist, startBackups } from "./store.js";
import { randomUUID } from "node:crypto";
import {
  registerAuth,
  requireRole,
  sameOrigin,
  initializeUsers,
  registerUserRoutes,
} from "./auth.js";
import {
  initializeOperations,
  effectiveProducts,
  opening,
  payloadHash,
} from "./operations.js";
import { registerManagement } from "./management.js";
import { registerPush, queueOrderNotification } from "./push.js";
import { price, transitions } from "./domain.js";

let state = load() || {
  products: [
    [
      "Burger Santa",
      "Hamburguesas",
      12900,
      "Carne a la parrilla, cheddar, tocino y nuestro aderezo de la casa.",
    ],
    [
      "Papas de la casa",
      "Snacks",
      6900,
      "Crujientes, con especias y un toque de parmesano.",
    ],
    ["Alitas BBQ", "Alitas", 14900, "8 piezas bañadas en BBQ, con dip ranch."],
    [
      "Boneless Buffalo",
      "Alitas",
      13900,
      "Pollo crujiente, salsa buffalo y aderezo ranch.",
    ],
    [
      "Limonada mineral",
      "Bebidas",
      4500,
      "Limón fresco, agua mineral y mucho hielo.",
    ],
    [
      "Pizza pepperoni",
      "Pizzas",
      17900,
      "Masa artesanal, mozzarella y pepperoni.",
    ],
  ].map((p, i) => ({
    id: i + 1,
    name: p[0],
    category: p[1],
    price: p[2],
    description: p[3],
    image: `/images/food-${i + 1}.jpg`,
    active: true,
  })),
  zones: [
    { id: 1, name: "Centro", fee: 2500, active: true },
    { id: 2, name: "Las Flores", fee: 3500, active: true },
    { id: 3, name: "San José", fee: 4000, active: true },
  ],
  orders: [],
};
// Upgrade only the six original demo photos; preserve custom images.
for (const p of state.products)
  if (
    p.id >= 1 &&
    p.id <= 6 &&
    p.image.startsWith("https://images.unsplash.com/")
  )
    p.image = `/images/food-${p.id}.jpg`;
initializeOperations(state);
await initializeUsers();
const save = (audit) => persist(state, audit);
save();
const app = express();
app.use(express.json({ limit: "30kb" }));
const clients = new Set();
const publish = (audit) => {
  save(audit);
  for (const c of clients) c.write("data: update\n\n");
};
registerAuth(app);
app.use("/api/staff", sameOrigin, (_, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
const kitchenAccess = requireRole("staff", "owner");
const ownerAccess = requireRole("owner");
app.get("/api/catalog", (_, res) =>
  res.json({
    products: effectiveProducts(state),
    zones: state.zones,
    demo: false,
    digitalPayments: paymentsEnabled(),
    settings: state.settings,
    availability: opening(state.settings),
  }),
);
app.get("/api/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  res.write(": connected\n\n");
  clients.add(res);
  const timer = setInterval(() => res.write(": ping\n\n"), 20000);
  req.on("close", () => {
    clearInterval(timer);
    clients.delete(res);
  });
});
const inFlight = new Map();
app.post("/api/orders", async (req, res) => {
  const b = req.body || {};
  if (!/^[a-f0-9-]{36}$/i.test(b.requestId || ""))
    return res.status(400).json({
      error: "Falta la clave única de compra. Recarga el formulario.",
    });
  let hash;
  try {
    hash = payloadHash(b);
  } catch {
    return res.status(400).json({ error: "Carrito inválido" });
  }
  const previous = state.orders.find((o) => o.requestId === b.requestId);
  if (previous && previous.payloadHash !== hash)
    return res.status(409).json({
      error:
        "La clave de compra ya corresponde a otro contenido. Inicia un pedido nuevo.",
    });
  let task = inFlight.get(b.requestId);
  if (!task) {
    task = (async () => {
      let order = previous;
      if (!order) {
        const availability = opening(state.settings);
        if (!availability.open)
          throw Object.assign(Error(availability.reason), { status: 409 });
        if (b.payment === "mp" && !paymentsEnabled())
          throw Error(
            "Mercado Pago aún no está conectado. Selecciona efectivo.",
          );
        const phone = String(b.phone || "").replace(/\D/g, "");
        if (
          typeof b.name !== "string" ||
          !b.name.trim() ||
          b.name.length > 100 ||
          !/^\d{10,15}$/.test(phone)
        )
          throw Error("Nombre y teléfono válidos son obligatorios");
        if (
          b.delivery === "delivery" &&
          (typeof b.address !== "string" ||
            !b.address.trim() ||
            b.address.length > 500)
        )
          throw Error("Indica dirección y referencias");
        const zone = state.zones.find((z) => z.id === Number(b.zoneId));
        const totals = price(
          b.items,
          effectiveProducts(state),
          zone,
          b.delivery,
          b.payment,
        );
        if (b.expectedTotal !== undefined && b.expectedTotal !== totals.total)
          throw Error(
            "El precio cambió. Revisa el total actualizado antes de confirmar.",
          );
        order = {
          id: randomUUID(),
          requestId: b.requestId,
          payloadHash: hash,
          folio: "LS-" + randomUUID().slice(0, 8).toUpperCase(),
          createdAt: new Date().toISOString(),
          status: "pending",
          paymentStatus: "unpaid",
          name: b.name.trim(),
          phone,
          address: b.delivery === "delivery" ? b.address : "",
          zone: b.delivery === "delivery" ? zone.name : null,
          zoneId: b.delivery === "delivery" ? zone.id : null,
          delivery: b.delivery,
          payment: b.payment,
          ...totals,
        };
        state.orders.push(order);
        try {
          publish({
            actor: "cliente",
            action: "order.created",
            target: order.id,
            details: { folio: order.folio, total: order.total },
          });
        } catch (e) {
          state.orders.pop();
          throw e;
        }
      }
      if (order.payment === "mp" && !order.checkoutUrl) {
        try {
          Object.assign(order, await createPreference(order));
          order.paymentError = false;
          publish();
        } catch (e) {
          order.paymentError = true;
          publish();
          throw e;
        }
      }
      return order;
    })();
    inFlight.set(b.requestId, task);
  }
  try {
    const order = await task;
    res.status(previous ? 200 : 201).json(order);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  } finally {
    if (inFlight.get(b.requestId) === task) inFlight.delete(b.requestId);
  }
});
app.get("/api/orders/:id", (req, res) => {
  const o = state.orders.find((o) => o.id === req.params.id);
  if (!o) return res.sendStatus(404);
  res.json(o);
});
app.get("/api/staff/orders", kitchenAccess, (_, res) => res.json(state.orders));
app.patch("/api/staff/orders/:id", kitchenAccess, (req, res) => {
  const o = state.orders.find((o) => o.id === req.params.id);
  if (!o) return res.sendStatus(404);
  const b = req.body,
    status = b.status || o.status;
  if (status !== o.status && !transitions[o.status].includes(status))
    return res.status(400).json({ error: "Transición no permitida" });
  if (status === o.status && b.prepMinutes === undefined)
    return res.status(400).json({ error: "No hay cambios" });
  if (o.payment === "mp" && o.paymentStatus !== "paid" && status !== "rejected")
    return res
      .status(400)
      .json({ error: "El pago digital aún no está confirmado" });
  if (
    b.prepMinutes !== undefined &&
    (!Number.isInteger(b.prepMinutes) ||
      b.prepMinutes < 1 ||
      b.prepMinutes > 240 ||
      !["pending", "cooking"].includes(o.status))
  )
    return res
      .status(400)
      .json({ error: "Tiempo estimado inválido (1 a 240 minutos)" });
  if (
    status === "rejected" &&
    (typeof b.rejectionReason !== "string" ||
      b.rejectionReason.trim().length < 3 ||
      b.rejectionReason.length > 300)
  )
    return res
      .status(400)
      .json({ error: "Indica el motivo del rechazo (3 a 300 caracteres)" });
  const now = new Date().toISOString();
  if (status === "cooking" || b.prepMinutes !== undefined) {
    o.estimatedReadyAt = new Date(
      Date.now() + (b.prepMinutes || state.settings.defaultPrepMinutes) * 60000,
    ).toISOString();
    o.acceptedAt ??= now;
  }
  if (status === "rejected") {
    o.rejectionReason = b.rejectionReason.trim();
    o.rejectedAt = now;
    o.refundRequired = o.payment === "mp" && o.paymentStatus === "paid";
  }
  if (status === "completed") {
    o.completedAt = now;
    if (o.payment === "cash") {
      o.paymentStatus = "paid";
      o.paidAt = now;
    }
  }
  o.status = status;
  publish({
    actor: req.actor,
    action: "order.updated",
    target: o.id,
    details: {
      folio: o.folio,
      status,
      prepMinutes: b.prepMinutes,
      rejectionReason: o.rejectionReason,
    },
  });
  queueOrderNotification(o, state.settings);
  res.json(o);
});
app.patch("/api/staff/products/:id", ownerAccess, (req, res) => {
  const p = state.products.find((p) => p.id === Number(req.params.id));
  if (!p) return res.sendStatus(404);
  if (
    req.body.price !== undefined &&
    (!Number.isInteger(req.body.price) ||
      req.body.price < 0 ||
      req.body.price > 10000000)
  )
    return res.status(400).json({ error: "Precio inválido" });
  if (req.body.price !== undefined) p.price = req.body.price;
  if (typeof req.body.active === "boolean") p.active = req.body.active;
  publish({
    actor: req.actor,
    action: "product.updated",
    target: String(p.id),
    details: { price: p.price, active: p.active },
  });
  res.json(p);
});
app.post("/api/staff/zones", ownerAccess, (req, res) => {
  const b = req.body;
  if (
    !b.name?.trim() ||
    b.name.length > 80 ||
    !Number.isInteger(b.fee) ||
    b.fee < 0 ||
    b.fee > 1000000
  )
    return res.status(400).json({ error: "Colonia o tarifa inválida" });
  const z = { id: Date.now(), name: b.name.trim(), fee: b.fee, active: true };
  state.zones.push(z);
  publish({ actor: req.actor, action: "zone.created", target: String(z.id) });
  res.status(201).json(z);
});
app.patch("/api/staff/zones/:id", ownerAccess, (req, res) => {
  const z = state.zones.find((z) => z.id === Number(req.params.id));
  if (!z) return res.sendStatus(404);
  const b = req.body;
  if (
    (b.fee !== undefined &&
      (!Number.isInteger(b.fee) || b.fee < 0 || b.fee > 1000000)) ||
    (b.name !== undefined && (!b.name.trim() || b.name.length > 80))
  )
    return res.status(400).json({ error: "Datos inválidos" });
  if (b.name !== undefined) z.name = b.name.trim();
  if (b.fee !== undefined) z.fee = b.fee;
  if (typeof b.active === "boolean") z.active = b.active;
  publish({ actor: req.actor, action: "zone.updated", target: String(z.id) });
  res.json(z);
});
app.post("/api/payments/webhook", async (req, res) => {
  if (!validSignature(req)) return res.sendStatus(401);
  try {
    const id = String(req.query["data.id"]);
    const p = await fetchPayment(id);
    const o = state.orders.find(
      (o) => o.id === p.external_reference && o.payment === "mp",
    );
    if (!o) return res.sendStatus(200);
    if (
      String(p.id) !== id ||
      p.currency_id !== "MXN" ||
      Math.round(Number(p.transaction_amount) * 100) !== o.total
    )
      return res.sendStatus(400);
    if (["approved", "refunded", "charged_back"].includes(p.status)) {
      const recorded = (o.refundEvents || []).reduce(
        (sum, e) => sum + e.amount,
        0,
      );
      const providerRefund =
        p.status === "charged_back" || p.status === "refunded"
          ? o.total
          : Math.round(Number(p.transaction_amount_refunded || 0) * 100);
      if (providerRefund > recorded && providerRefund <= o.total) {
        o.refundEvents ??= [];
        o.refundEvents.push({
          at: new Date().toISOString(),
          amount: providerRefund - recorded,
        });
      }
    }
    if (p.status === "approved") {
      o.paidAt ??= new Date().toISOString();
      o.paymentStatus = "paid";
      o.paymentId = String(p.id);
      publish({
        actor: "Mercado Pago",
        action: "payment.confirmed",
        target: o.id,
      });
      queueOrderNotification(o, state.settings);
    } else if (p.status === "refunded" || p.status === "charged_back") {
      o.paymentStatus = p.status;
      o.refundRequired = false;
      publish({
        actor: "Mercado Pago",
        action: "payment.updated",
        target: o.id,
        details: { status: p.status },
      });
    }
    res.sendStatus(200);
  } catch {
    res.sendStatus(503);
  }
});
registerManagement(app, state, { ownerAccess, kitchenAccess, publish });
registerUserRoutes(app, ownerAccess);
registerPush(app, state);
startBackups();
const availabilityTimer = setInterval(() => {
  for (const c of clients) c.write("data: update\n\n");
}, 60000);
availabilityTimer.unref();
if (process.env.NODE_ENV === "production" || process.env.SERVE_BUILD === "1") {
  app.get(["/personal", "/personal/"], (_, res) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    });
    res.sendFile(resolve("dist/index.html"));
  });
  app.use(
    "/assets",
    express.static("dist/assets", { immutable: true, maxAge: "1y" }),
  );
  app.use(express.static("dist", { maxAge: 0 }));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({ server: { middlewareMode: true } });
  app.use(vite.middlewares);
}
app.listen(
  Number(process.env.PORT) || 3000,
  process.env.SERVE_BUILD === "1" && process.env.NODE_ENV !== "production"
    ? "127.0.0.1"
    : "0.0.0.0",
  () => console.log("Los Santos listo en puerto " + (process.env.PORT || 3000)),
);
