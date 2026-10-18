// La app completa (rutas y estado), igual para Node y Cloudflare.
// La plataforma se registra antes en runtime.js (ver store.js o cloudflare/).
import {
  paymentsEnabled,
  createPreference,
  validSignature,
  fetchPayment,
  searchPayments,
} from "./payments.js";
import { load, save as persist } from "./store-core.js";
import { startBackups } from "./backups.js";
import { realtime } from "./runtime.js";
const randomUUID = () => crypto.randomUUID();
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
import { price, transitions, transferEnabled } from "./domain.js";
import {
  seedProducts,
  seedZones,
  seedCategories,
  seedIngredients,
  migrateDemoMenu,
} from "./seed.js";
import {
  initializeCatalog,
  registerCatalog,
  publicCatalog,
} from "./catalog.js";


export async function createApp(app, { raw }) {
  let state = load() || {
    products: structuredClone(seedProducts),
    zones: structuredClone(seedZones),
    orders: [],
    categories: structuredClone(seedCategories),
    ingredients: structuredClone(seedIngredients),
  };
  // Versión 1: sustituir solo las seis fotos remotas de demostración por locales.
  for (const p of state.products)
    if (p.id >= 1 && p.id <= 6 && p.image?.startsWith("https://images.unsplash.com/"))
      p.image = `/images/food-${p.id}.jpg`;
  if (migrateDemoMenu(state))
    console.log("Menú de demostración sustituido por el menú de Los Santos.");
  initializeOperations(state);
  initializeCatalog(state);
  await initializeUsers();
  const save = (audit) => persist(state, audit);
  save();
  const publish = (audit) => {
    save(audit);
    realtime.broadcast();
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
      ...publicCatalog(state, effectiveProducts(state)),
      zones: state.zones,
      demo: false,
      digitalPayments: paymentsEnabled(),
      settings: state.settings,
      availability: opening(state.settings),
    }),
  );
  // Para monitoreo externo (UptimeRobot, etc.): sin datos privados.
  app.get("/api/health", (_, res) =>
    res.set("Cache-Control", "no-store").json({
      ok: true,
      uptime: Math.round(typeof process.uptime === "function" ? process.uptime() : 0),
      clients: realtime.clients(),
    }),
  );
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
          if (b.payment === "transfer" && !transferEnabled(state.settings))
            throw Error("El pago por transferencia no está disponible. Elige efectivo.");
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
            // Se guarda el tiempo de traslado vigente al comprar: si luego cambia
            // en Administración, este pedido conserva lo que se le prometió.
            deliveryMinutes:
              b.delivery === "delivery" ? (zone.deliveryMinutes ?? 20) : null,
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
  // ?recent=1 (Cocina): pedidos abiertos y los cerrados de las últimas 24 h,
  // para no enviar todo el historial a cada tableta en cada actualización.
  app.get("/api/staff/orders", kitchenAccess, (req, res) => {
    if (!req.query.recent) return res.json(state.orders);
    const since = Date.now() - 24 * 60 * 60 * 1000;
    res.json(
      state.orders.filter(
        (o) =>
          !["completed", "rejected"].includes(o.status) ||
          new Date(o.completedAt || o.rejectedAt || o.createdAt).getTime() > since,
      ),
    );
  });
  app.patch("/api/staff/orders/:id", kitchenAccess, (req, res) => {
    const o = state.orders.find((o) => o.id === req.params.id);
    if (!o) return res.sendStatus(404);
    const b = req.body,
      status = b.status || o.status;
    // Dos tabletas pulsando a la vez: la segunda recibe aviso en lugar de
    // repetir la acción (p. ej. sobrescribir el tiempo estimado).
    if (b.status !== undefined && b.status === o.status)
      return res.status(409).json({
        error: "Otra persona ya actualizó este pedido. La pantalla se actualizó.",
      });
    if (status !== o.status && !transitions[o.status].includes(status))
      return res.status(400).json({ error: "Transición no permitida" });
    if (status === o.status && b.prepMinutes === undefined)
      return res.status(400).json({ error: "No hay cambios" });
    if (o.payment !== "cash" && o.paymentStatus !== "paid" && status !== "rejected")
      return res.status(400).json({
        error:
          o.payment === "transfer"
            ? "Confirma primero que llegó la transferencia"
            : "El pago digital aún no está confirmado",
      });
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
    if (status === "ready" && o.status !== "ready") o.readyAt = now;
    if (status === "rejected") {
      o.rejectionReason = b.rejectionReason.trim();
      o.rejectedAt = now;
      o.refundRequired = o.payment !== "cash" && o.paymentStatus === "paid";
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
  const validMinutes = (m) => Number.isInteger(m) && m >= 1 && m <= 180;
  app.post("/api/staff/zones", ownerAccess, (req, res) => {
    const b = req.body;
    if (
      !b.name?.trim() ||
      b.name.length > 80 ||
      !Number.isInteger(b.fee) ||
      b.fee < 0 ||
      b.fee > 1000000 ||
      (b.deliveryMinutes !== undefined && !validMinutes(b.deliveryMinutes))
    )
      return res
        .status(400)
        .json({ error: "Colonia, tarifa o tiempo de entrega inválidos (1 a 180 min)" });
    const z = {
      id: Date.now(),
      name: b.name.trim(),
      fee: b.fee,
      deliveryMinutes: b.deliveryMinutes ?? 20,
      active: true,
    };
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
      (b.name !== undefined && (!b.name.trim() || b.name.length > 80)) ||
      (b.deliveryMinutes !== undefined && !validMinutes(b.deliveryMinutes))
    )
      return res
        .status(400)
        .json({ error: "Datos inválidos (tiempo de entrega: 1 a 180 min)" });
    if (b.name !== undefined) z.name = b.name.trim();
    if (b.fee !== undefined) z.fee = b.fee;
    if (b.deliveryMinutes !== undefined) z.deliveryMinutes = b.deliveryMinutes;
    if (typeof b.active === "boolean") z.active = b.active;
    publish({
      actor: req.actor,
      action: "zone.updated",
      target: String(z.id),
      details: { fee: z.fee, deliveryMinutes: z.deliveryMinutes, active: z.active },
    });
    res.json(z);
  });
  // Aplica a un pedido el estado que Mercado Pago reporta para un pago.
  // Lo usan el webhook firmado y la consulta manual desde Cocina.
  function applyPayment(o, p, actor) {
    if (
      p.currency_id !== "MXN" ||
      Math.round(Number(p.transaction_amount) * 100) !== o.total
    )
      throw Object.assign(Error("El importe reportado no coincide con el pedido"), {
        status: 400,
      });
    if (["approved", "refunded", "charged_back"].includes(p.status)) {
      const recorded = (o.refundEvents || []).reduce((sum, e) => sum + e.amount, 0);
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
      const changed = o.paymentStatus !== "paid";
      o.paidAt ??= new Date().toISOString();
      o.paymentStatus = "paid";
      o.paymentId = String(p.id);
      publish({ actor, action: "payment.confirmed", target: o.id });
      if (changed) queueOrderNotification(o, state.settings);
    } else if (p.status === "refunded" || p.status === "charged_back") {
      o.paymentStatus = p.status;
      o.refundRequired = false;
      publish({
        actor,
        action: "payment.updated",
        target: o.id,
        details: { status: p.status },
      });
    }
  }
  app.post("/api/payments/webhook", async (req, res) => {
    if (!validSignature(req)) return res.sendStatus(401);
    // Solo procesamos notificaciones de pagos; otros temas se confirman.
    const topic = req.query.type || req.query.topic || req.body?.type;
    if (topic && topic !== "payment") return res.sendStatus(200);
    try {
      const id = String(req.query["data.id"]);
      const p = await fetchPayment(id);
      const o = state.orders.find(
        (o) => o.id === p.external_reference && o.payment === "mp",
      );
      if (!o) return res.sendStatus(200);
      if (String(p.id) !== id) return res.sendStatus(400);
      try {
        applyPayment(o, p, "Mercado Pago");
      } catch (e) {
        return res.sendStatus(e.status || 400);
      }
      res.sendStatus(200);
    } catch {
      res.sendStatus(503);
    }
  });
  // Transferencia: Cocina confirma que llegó el comprobante y el dinero.
  app.post("/api/staff/orders/:id/confirm-transfer", kitchenAccess, (req, res) => {
    const o = state.orders.find((o) => o.id === req.params.id);
    if (!o) return res.sendStatus(404);
    if (o.payment !== "transfer")
      return res.status(400).json({ error: "Este pedido no es por transferencia" });
    if (o.status === "rejected")
      return res.status(400).json({ error: "El pedido está rechazado" });
    if (o.paymentStatus === "paid")
      return res.status(409).json({ error: "Otra persona ya confirmó esta transferencia." });
    o.paymentStatus = "paid";
    o.paidAt = new Date().toISOString();
    publish({
      actor: req.actor,
      action: "payment.transfer.confirmed",
      target: o.id,
      details: { folio: o.folio, total: o.total },
    });
    queueOrderNotification(o, state.settings);
    res.json(o);
  });
  // Respaldo si el webhook no llegó: Cocina consulta el pago por referencia.
  const checking = new Set();
  app.post("/api/staff/orders/:id/payment-check", kitchenAccess, async (req, res) => {
    const o = state.orders.find((o) => o.id === req.params.id);
    if (!o) return res.sendStatus(404);
    if (o.payment !== "mp")
      return res.status(400).json({ error: "Este pedido no se pagó con Mercado Pago" });
    if (!paymentsEnabled())
      return res.status(400).json({ error: "Mercado Pago no está configurado en el servidor" });
    if (checking.has(o.id)) return res.status(429).json({ error: "Consulta en curso" });
    checking.add(o.id);
    try {
      const found = await searchPayments(o.id);
      const best =
        found.find((p) => p.status === "approved") ||
        found.find((p) => ["refunded", "charged_back"].includes(p.status)) ||
        found[0];
      if (best) applyPayment(o, best, req.actor);
      res.json({ status: best?.status || null, paymentStatus: o.paymentStatus });
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message });
    } finally {
      checking.delete(o.id);
    }
  });
  registerCatalog(app, state, {
    ownerAccess,
    publish,
    effective: () => effectiveProducts(state),
    raw,
  });
  registerManagement(app, state, { ownerAccess, kitchenAccess, publish });
  registerUserRoutes(app, ownerAccess);
  registerPush(app, state);
  startBackups();
  return { state, publish };
}
