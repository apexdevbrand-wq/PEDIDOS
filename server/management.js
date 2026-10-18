import { recordAudit, getMeta, findOrder, ordersForReport } from "./store-core.js";
import { platform } from "./runtime.js";
import {
  makeBackup,
  listBackups,
  readBackup,
  offsiteEnabled,
  shipOffsite,
} from "./backups.js";
import {
  validateSettings,
  validateOptions,
  financialReport,
} from "./operations.js";
import { whatsapp, ticketHtml } from "./messages.js";
import { paymentLabel } from "./domain.js";
export function registerManagement(
  app,
  state,
  { ownerAccess, kitchenAccess, publish },
) {
  const audit = (req, action, target, details) => ({
    actor: req.actor,
    action,
    target,
    details,
  });
  app.patch("/api/staff/settings", ownerAccess, (req, res) => {
    try {
      const b = validateSettings(req.body);
      Object.assign(state.settings, b);
      publish(
        audit(req, "settings.updated", "business", { fields: Object.keys(b) }),
      );
      res.json(state.settings);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.post("/api/staff/pause", kitchenAccess, (req, res) => {
    const minutes = req.body.minutes;
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 120)
      return res
        .status(400)
        .json({ error: "La pausa debe ser de 0 a 120 minutos" });
    state.settings.pausedUntil = minutes
      ? new Date(Date.now() + minutes * 60000).toISOString()
      : null;
    publish(audit(req, "orders.paused", "business", { minutes }));
    res.json(state.settings);
  });
  app.get("/api/staff/ingredients", ownerAccess, (_, res) =>
    res.json(state.ingredients),
  );
  app.post("/api/staff/ingredients", ownerAccess, (req, res) => {
    const name = req.body.name;
    if (typeof name !== "string" || !name.trim() || name.length > 80)
      return res.status(400).json({ error: "Nombre de insumo inválido" });
    const item = { id: crypto.randomUUID(), name: name.trim(), available: true };
    state.ingredients.push(item);
    publish(audit(req, "ingredient.created", item.id));
    res.status(201).json(item);
  });
  app.patch("/api/staff/ingredients/:id", ownerAccess, (req, res) => {
    const item = state.ingredients.find((i) => i.id === req.params.id);
    if (!item) return res.sendStatus(404);
    if (typeof req.body.available !== "boolean")
      return res.status(400).json({ error: "Indica disponibilidad" });
    item.available = req.body.available;
    publish(
      audit(req, "ingredient.updated", item.id, { available: item.available }),
    );
    res.json(item);
  });
  app.put("/api/staff/products/:id/options", ownerAccess, (req, res) => {
    const p = state.products.find((p) => p.id === Number(req.params.id));
    if (!p) return res.sendStatus(404);
    try {
      const options = validateOptions(req.body.options, state.ingredients);
      if (
        !Array.isArray(req.body.ingredientIds) ||
        req.body.ingredientIds.some(
          (id) => !state.ingredients.some((i) => i.id === id),
        )
      )
        throw Error("Insumos inválidos");
      p.options = options;
      p.ingredientIds = req.body.ingredientIds;
      publish(audit(req, "product.options.updated", String(p.id)));
      res.json(p);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.get("/api/staff/orders/:id/whatsapp", kitchenAccess, (req, res) => {
    const o = findOrder(state, req.params.id);
    if (!o) return res.sendStatus(404);
    try {
      res.json(whatsapp(o, state.settings));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  const ticket = (req, res) => {
    const o = findOrder(state, req.params.id);
    if (!o) return res.sendStatus(404);
    res.set("Cache-Control", "no-store");
    res.json({
      html: ticketHtml(
        o,
        state.settings,
        req.query.kind === "kitchen" ? "kitchen" : "customer",
      ),
    });
  };
  app.get("/api/staff/orders/:id/ticket", kitchenAccess, ticket);
  app.get("/api/orders/:id/ticket", ticket);
  app.get("/api/staff/reports", ownerAccess, (req, res) => {
    const date =
      req.query.date ||
      new Date().toLocaleDateString("en-CA", {
        timeZone: state.settings.timezone,
      });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(400).json({ error: "Fecha inválida" });
    const orders = ordersForReport(date + "T00:00:00Z");
    const report = financialReport(orders, {
      date,
      timezone: state.settings.timezone,
    });
    report.zones = Object.fromEntries(
      state.zones.map((z) => [
        z.id,
        orders.filter(
          (o) =>
            o.zoneId === z.id &&
            o.status !== "rejected" &&
            new Date(o.createdAt).toLocaleDateString("en-CA", {
              timeZone: state.settings.timezone,
            }) === date,
        ).length,
      ]),
    );
    if (req.query.format === "csv") {
      const rows = [
        [
          "Folio",
          "Cobrado en",
          "Metodo",
          "Estado",
          "Productos MXN",
          "Envio MXN",
          "Recargo MP MXN",
          "Total MXN",
        ],
        ...report.orders.map((o) => [
          o.folio,
          o.paidAt,
          paymentLabel(o.payment),
          o.status,
          (o.subtotal / 100).toFixed(2),
          (o.shipping / 100).toFixed(2),
          (o.surcharge / 100).toFixed(2),
          (o.total / 100).toFixed(2),
        ]),
        ...(report.refunds || []).map((r) => [
          r.folio,
          r.at,
          r.payment,
          "reembolso",
          "0.00",
          "0.00",
          "0.00",
          (-r.amount / 100).toFixed(2),
        ]),
      ];
      res.set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="corte-${date}.csv"`,
      });
      return res.send(
        "\ufeff" +
          rows
            .map((r) =>
              r
                .map((v) => '"' + String(v).replaceAll('"', '""') + '"')
                .join(","),
            )
            .join("\r\n"),
      );
    }
    res.json(report);
  });
  app.get("/api/staff/closures", ownerAccess, (_, res) =>
    res.json([...state.closures].reverse()),
  );
  app.post("/api/staff/closures", ownerAccess, (req, res) => {
    const b = req.body;
    if (
      !Number.isInteger(b.countedCash) ||
      b.countedCash < 0 ||
      typeof b.notes !== "string" ||
      b.notes.length > 500 ||
      !/^[-a-f0-9]{36}$/i.test(b.requestId || "")
    )
      return res.status(400).json({
        error:
          "Corte inválido: indica efectivo contado, notas y clave de operación",
      });
    const prior = state.closures.find((c) => c.requestId === b.requestId);
    if (prior) return res.json(prior);
    const from = state.closures.at(-1)?.to || null,
      to = new Date().toISOString(),
      report = financialReport(ordersForReport(from), {
        from,
        to,
        timezone: state.settings.timezone,
      });
    const closure = {
      id: crypto.randomUUID(),
      requestId: b.requestId,
      from,
      to,
      actor: req.actor.username,
      notes: b.notes,
      countedCash: b.countedCash,
      difference: b.countedCash - report.cashCollected,
      ...report,
    };
    state.closures.push(closure);
    publish(
      audit(req, "cash.closed", closure.id, { difference: closure.difference }),
    );
    res.status(201).json(closure);
  });
  app.get("/api/staff/backups", ownerAccess, (_, res) =>
    res.json(listBackups()),
  );
  app.post("/api/staff/backups", ownerAccess, async (req, res) => {
    try {
      const result = await makeBackup();
      recordAudit(req.actor, "backup.created", result.name);
      res.status(201).json(result);
    } catch {
      res.status(500).json({
        error:
          "No se pudo crear el respaldo. Revisa espacio y permisos del disco.",
      });
    }
  });
  app.get("/api/staff/backups-offsite", ownerAccess, (_, res) =>
    res.json({ configured: offsiteEnabled(), platform, ...getMeta("offsite", {}) }),
  );
  app.post("/api/staff/backups-offsite", ownerAccess, async (req, res) => {
    if (!offsiteEnabled())
      return res.status(400).json({
        error: "Falta configurar el almacenamiento externo (variables BACKUP_S3_* en .env).",
      });
    try {
      const backup = await makeBackup("manual");
      const r = await shipOffsite(backup);
      recordAudit(req.actor, "backup.offsite", backup.name, { photos: r.photos });
      res.status(201).json({ ...getMeta("offsite", {}), configured: true });
    } catch (e) {
      res.status(502).json({ error: "No se pudo enviar el respaldo: " + e.message });
    }
  });
  app.get("/api/staff/backups/:name", ownerAccess, (req, res) => {
    const file = readBackup(req.params.name);
    if (!file) return res.sendStatus(404);
    res.set({
      "Content-Type": file.type,
      "Content-Disposition": `attachment; filename="${req.params.name}"`,
    });
    res.send(file.body);
  });
}
