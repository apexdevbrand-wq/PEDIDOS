import { db, push, schedule } from "./runtime.js";
import { getMeta, setMeta, findOrder } from "./store-core.js";
import { orderMessage } from "./messages.js";
let keys;
export const forgetPushKeys = () => (keys = undefined);
async function vapid() {
  keys ??= getMeta("vapid");
  if (!keys) {
    keys = await push.generateKeys();
    setMeta("vapid", keys);
  }
  return keys;
}
const subject = () => process.env.VAPID_SUBJECT || "mailto:pedidos@example.com";
export function validSubscription(s) {
  try {
    const u = new URL(s.endpoint),
      hosts = [
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ];
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443") &&
      (hosts.includes(u.hostname) ||
        u.hostname.endsWith(".push.services.mozilla.com") ||
        u.hostname.endsWith(".notify.windows.com")) &&
      s.endpoint.length < 2000 &&
      /^[A-Za-z0-9_-]{80,120}$/.test(s.keys?.p256dh) &&
      /^[A-Za-z0-9_-]{20,40}$/.test(s.keys?.auth)
    );
  } catch {
    return false;
  }
}
export function queueOrderNotification(order, settings) {
  if (
    !db
      .prepare("SELECT 1 FROM push_subscriptions WHERE order_id=? LIMIT 1")
      .get(order.id)
  )
    return;
  db.prepare(
    "INSERT INTO push_jobs(id,order_id,payload,created_at) VALUES(?,?,?,?)",
  ).run(
    crypto.randomUUID(),
    order.id,
    JSON.stringify({
      title: `${settings.businessName} · ${order.folio}`,
      body: orderMessage(order, settings).slice(0, 600),
      tag: order.id,
      url: "/?order=" + encodeURIComponent(order.id),
    }),
    new Date().toISOString(),
  );
  schedule.soon(deliver());
}
let running = false;
export async function deliver() {
  if (running) return true;
  running = true;
  try {
    const { publicKey, privateKey } = await vapid();
    const jobs = db
      .prepare(
        "SELECT * FROM push_jobs WHERE status='queued' AND attempts<3 ORDER BY created_at LIMIT 20",
      )
      .all();
    for (const job of jobs) {
      const subscriptions = db
        .prepare("SELECT * FROM push_subscriptions WHERE order_id=?")
        .all(job.order_id);
      let retry = false;
      for (const row of subscriptions) {
        try {
          await push.send(JSON.parse(row.subscription), job.payload, {
            TTL: 3600,
            publicKey,
            privateKey,
            subject: subject(),
          });
        } catch (e) {
          if ([404, 410].includes(e.statusCode))
            db.prepare(
              "DELETE FROM push_subscriptions WHERE order_id=? AND endpoint=?",
            ).run(job.order_id, row.endpoint);
          else retry = true;
        }
      }
      db.prepare(
        "UPDATE push_jobs SET attempts=attempts+1,status=?,last_error=? WHERE id=?",
      ).run(
        retry ? (job.attempts >= 2 ? "failed" : "queued") : "sent",
        retry ? "Proveedor no disponible" : null,
        job.id,
      );
    }
    // ¿Quedan avisos por reintentar? En Cloudflare se programa una alarma.
    const left = db
      .prepare("SELECT 1 FROM push_jobs WHERE status='queued' AND attempts<3 LIMIT 1")
      .get();
    if (left) schedule.kick("push", 30000);
    return Boolean(left);
  } finally {
    running = false;
  }
}
export function registerPush(app, state) {
  app.get("/api/push/key", async (_, res) => res.json({ publicKey: (await vapid()).publicKey }));
  app.post("/api/orders/:id/push", (req, res) => {
    const order = findOrder(state, req.params.id);
    if (!order) return res.sendStatus(404);
    if (!validSubscription(req.body))
      return res
        .status(400)
        .json({ error: "Suscripción push inválida o proveedor no permitido" });
    const existing = db
      .prepare("SELECT count(*) AS n FROM push_subscriptions WHERE order_id=?")
      .get(order.id).n;
    if (
      existing >= 3 &&
      !db
        .prepare(
          "SELECT 1 FROM push_subscriptions WHERE order_id=? AND endpoint=?",
        )
        .get(order.id, req.body.endpoint)
    )
      return res
        .status(409)
        .json({ error: "Máximo tres dispositivos por pedido" });
    db.prepare("INSERT OR REPLACE INTO push_subscriptions VALUES(?,?,?)").run(
      order.id,
      req.body.endpoint,
      JSON.stringify({
        endpoint: req.body.endpoint,
        expirationTime: req.body.expirationTime || null,
        keys: req.body.keys,
      }),
    );
    queueOrderNotification(order, state.settings);
    res.status(201).json({ subscribed: true });
  });
  app.delete("/api/orders/:id/push", (req, res) => {
    db.prepare(
      "DELETE FROM push_subscriptions WHERE order_id=? AND endpoint=?",
    ).run(req.params.id, String(req.body?.endpoint || ""));
    res.json({ subscribed: false });
  });
  schedule.every("push", 30000, deliver);
  schedule.soon(deliver());
}
