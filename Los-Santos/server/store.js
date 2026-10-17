import { DatabaseSync, backup } from "node:sqlite";
import {
  mkdirSync,
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { shipBackup, offsiteConfig } from "./offsite.js";
mkdirSync("data", { recursive: true });
mkdirSync("data/backups", { recursive: true });
mkdirSync("data/uploads", { recursive: true });
const existed = existsSync("data/orders.sqlite");
export const db = new DatabaseSync("data/orders.sqlite");
db.exec("PRAGMA busy_timeout=5000");
export async function makeBackup(prefix = "manual") {
  const name = `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 6)}.sqlite`;
  const temporary = join("data/backups", name + ".tmp");
  try {
    await backup(db, temporary);
    const { renameSync } = await import("node:fs");
    renameSync(temporary, join("data/backups", name));
    return {
      name,
      createdAt: new Date().toISOString(),
      size: statSync(join("data/backups", name)).size,
    };
  } catch (e) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw e;
  }
}
if (existed) await makeBackup("pre-upgrade");
db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
function addColumn(table, name, type) {
  if (
    !db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .some((c) => c.name === name)
  )
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
}
addColumn("orders", "zone_id", "INTEGER REFERENCES zones(id)");
addColumn("zones", "delivery_minutes", "INTEGER NOT NULL DEFAULT 20");
addColumn("products", "details_json", "TEXT NOT NULL DEFAULT '{}'");
addColumn("orders", "details_json", "TEXT NOT NULL DEFAULT '{}'");
addColumn("orders", "request_key", "TEXT");
addColumn("order_items", "options_json", "TEXT NOT NULL DEFAULT '{}'");
db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS orders_request_key ON orders(request_key)",
);
const parse = (s) => JSON.parse(s || "{}");
export const getMeta = (key, fallback = null) => {
  const row = db.prepare("SELECT payload FROM app_meta WHERE key=?").get(key);
  return row ? parse(row.payload) : fallback;
};
export const setMeta = (key, value) =>
  db
    .prepare("INSERT OR REPLACE INTO app_meta VALUES(?,?)")
    .run(key, JSON.stringify(value));
export function recordAudit(actor, action, target, details = {}) {
  db.prepare("INSERT INTO audit_log VALUES(?,?,?,?,?,?)").run(
    randomUUID(),
    new Date().toISOString(),
    actor?.username || String(actor || "sistema"),
    action,
    target || null,
    JSON.stringify(details),
  );
}
export function load() {
  const products = db
    .prepare("SELECT * FROM products")
    .all()
    .map(({ details_json, active, ...p }) => ({
      ...p,
      ...parse(details_json),
      active: Boolean(active),
    }));
  if (!products.length) return null;
  const zones = db
    .prepare("SELECT * FROM zones")
    .all()
    .map(({ delivery_minutes, ...z }) => ({
      ...z,
      deliveryMinutes: delivery_minutes ?? 20,
      active: Boolean(z.active),
    }));
  const orders = db
    .prepare("SELECT * FROM orders ORDER BY created_at")
    .all()
    .map((o) => ({
      ...parse(o.details_json),
      id: o.id,
      folio: o.folio,
      createdAt: o.created_at,
      status: o.status,
      paymentStatus: o.payment_status,
      name: o.customer_name,
      phone: o.phone,
      address: o.address,
      zone: o.zone_name,
      zoneId: o.zone_id,
      delivery: o.delivery,
      payment: o.payment,
      subtotal: o.subtotal,
      shipping: o.shipping,
      surcharge: o.surcharge,
      total: o.total,
      preferenceId: o.preference_id,
      checkoutUrl: o.checkout_url,
      paymentId: o.payment_id,
      paymentError: Boolean(o.payment_error),
      requestId: o.request_key,
      lines: db
        .prepare("SELECT * FROM order_items WHERE order_id=? ORDER BY position")
        .all(o.id)
        .map((i) => ({
          ...parse(i.options_json),
          id: i.product_id,
          name: i.product_name,
          price: i.unit_price,
          quantity: i.quantity,
          notes: i.notes,
        })),
    }));
  return { products, zones, orders, ...getMeta("operations", {}) };
}
const written = new Map(),
  pending = new Map();
export function save(state, audit) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const p = db.prepare(
      "INSERT INTO products(id,name,category,price,description,image,active,details_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,price=excluded.price,description=excluded.description,image=excluded.image,active=excluded.active,details_json=excluded.details_json",
    );
    for (const x of state.products)
      p.run(
        x.id,
        x.name,
        x.category,
        x.price,
        x.description,
        x.image,
        Number(x.active),
        JSON.stringify({
          options: x.options || [],
          ingredientIds: x.ingredientIds || [],
          archived: Boolean(x.archived),
          featured: Boolean(x.featured),
          sortOrder: x.sortOrder ?? 0,
        }),
      );
    const z = db.prepare(
      "INSERT INTO zones(id,name,fee,active,delivery_minutes) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,fee=excluded.fee,active=excluded.active,delivery_minutes=excluded.delivery_minutes",
    );
    for (const x of state.zones)
      z.run(x.id, x.name, x.fee, Number(x.active), x.deliveryMinutes ?? 20);
    const o = db.prepare(
      "INSERT INTO orders(id,folio,created_at,status,payment_status,customer_name,phone,address,zone_name,delivery,payment,subtotal,shipping,surcharge,total,preference_id,checkout_url,payment_id,payment_error,zone_id,details_json,request_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payment_status=excluded.payment_status,preference_id=excluded.preference_id,checkout_url=excluded.checkout_url,payment_id=excluded.payment_id,payment_error=excluded.payment_error,details_json=excluded.details_json",
    );
    const line = db.prepare(
      "INSERT OR IGNORE INTO order_items(order_id,position,product_id,product_name,unit_price,quantity,notes,options_json) VALUES(?,?,?,?,?,?,?,?)",
    );
    for (const x of state.orders) {
      // Solo se escriben los pedidos que cambiaron desde el último guardado:
      // con miles de pedidos cada cambio sigue siendo instantáneo.
      const fingerprint = JSON.stringify(x);
      if (written.get(x.id) === fingerprint) continue;
      pending.set(x.id, fingerprint);
      const details = {
        payloadHash: x.payloadHash,
        rejectionReason: x.rejectionReason,
        estimatedReadyAt: x.estimatedReadyAt,
        acceptedAt: x.acceptedAt,
        completedAt: x.completedAt,
        rejectedAt: x.rejectedAt,
        paidAt: x.paidAt,
        refundRequired: x.refundRequired,
        refundEvents: x.refundEvents,
        deliveryMinutes: x.deliveryMinutes,
        readyAt: x.readyAt,
      };
      o.run(
        x.id,
        x.folio,
        x.createdAt,
        x.status,
        x.paymentStatus,
        x.name,
        x.phone,
        x.address,
        x.zone,
        x.delivery,
        x.payment,
        x.subtotal,
        x.shipping,
        x.surcharge,
        x.total,
        x.preferenceId || null,
        x.checkoutUrl || null,
        x.paymentId || null,
        Number(x.paymentError || false),
        x.zoneId || null,
        JSON.stringify(details),
        x.requestId || null,
      );
      x.lines.forEach((i, n) =>
        line.run(
          x.id,
          n,
          i.id,
          i.name,
          i.price,
          i.quantity,
          i.notes,
          JSON.stringify({
            basePrice: i.basePrice,
            selections: i.selections,
            optionLabels: i.optionLabels,
          }),
        ),
      );
    }
    setMeta("operations", {
      settings: state.settings,
      ingredients: state.ingredients,
      closures: state.closures || [],
      categories: state.categories || [],
    });
    if (audit)
      recordAudit(audit.actor, audit.action, audit.target, audit.details);
    db.exec("COMMIT");
    for (const [id, f] of pending) written.set(id, f);
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    pending.clear();
  }
}
export function listBackups() {
  return readdirSync("data/backups")
    .filter((n) => /^(auto|manual|pre-upgrade)-[\w.-]+\.sqlite$/.test(n))
    .map((name) => {
      const stat = statSync(join("data/backups", name));
      return { name, createdAt: stat.mtime.toISOString(), size: stat.size };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function backupPath(name) {
  if (!listBackups().some((b) => b.name === name)) return null;
  return resolve("data/backups", name);
}
export const offsiteEnabled = () => Boolean(offsiteConfig());
export function shipOffsite(backup) {
  return shipBackup({
    backupFile: join("data/backups", backup.name),
    backupName: backup.name,
    uploadDir: "data/uploads",
    uploadNames: readdirSync("data/uploads").filter((n) => /^[\w-]+\.(jpg|png|webp)$/.test(n)),
    getMeta,
    setMeta,
  });
}
export function startBackups() {
  const run = async () => {
    try {
      const backup = await makeBackup("auto");
      if (offsiteEnabled())
        await shipOffsite(backup).catch((e) =>
          console.error("No se pudo copiar el respaldo fuera del servidor:", e.message),
        );
      const list = listBackups().filter((x) => x.name.startsWith("auto-"));
      for (const item of list.slice(56))
        unlinkSync(join("data/backups", item.name));
      for (const item of listBackups()
        .filter((x) => x.name.startsWith("pre-upgrade-"))
        .slice(14))
        unlinkSync(join("data/backups", item.name));
    } catch (e) {
      console.error(
        "No se pudo completar el respaldo automático:",
        e.code || "error de almacenamiento",
      );
    }
  };
  run();
  const timer = setInterval(run, 6 * 60 * 60 * 1000);
  timer.unref();
}
