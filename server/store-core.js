// Lectura y escritura del estado de la app sobre la base SQLite de la
// plataforma activa (ver runtime.js). Sin dependencias de Node.
import { db } from "./runtime.js";
import { schema } from "./schema.js";
export function migrate() {
  db.exec(schema);
  addColumn("orders", "zone_id", "INTEGER REFERENCES zones(id)");
  addColumn("zones", "delivery_minutes", "INTEGER NOT NULL DEFAULT 20");
  addColumn("products", "details_json", "TEXT NOT NULL DEFAULT '{}'");
  addColumn("orders", "details_json", "TEXT NOT NULL DEFAULT '{}'");
  addColumn("orders", "request_key", "TEXT");
  addColumn("order_items", "options_json", "TEXT NOT NULL DEFAULT '{}'");
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS orders_request_key ON orders(request_key)",
  );
}
function addColumn(table, name, type) {
  if (
    !db
      .prepare(`SELECT name FROM pragma_table_info('${table}')`)
      .all()
      .some((c) => c.name === name)
  )
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
}
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
    crypto.randomUUID(),
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
  const items = new Map();
  for (const i of db
    .prepare("SELECT * FROM order_items ORDER BY order_id, position")
    .all()) {
    if (!items.has(i.order_id)) items.set(i.order_id, []);
    items.get(i.order_id).push(i);
  }
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
      lines: (items.get(o.id) || []).map((i) => ({
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
  try {
    db.transaction(() => writeState(state, audit));
    for (const [id, f] of pending) written.set(id, f);
  } finally {
    pending.clear();
  }
}
function writeState(state, audit) {
  {
    const p = db.prepare(
      "INSERT INTO products(id,name,category,price,description,image,active,details_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,price=excluded.price,description=excluded.description,image=excluded.image,active=excluded.active,details_json=excluded.details_json",
    );
    for (const x of state.products) {
      const key = "p:" + x.id,
        fingerprint = JSON.stringify(x);
      if (written.get(key) === fingerprint) continue;
      pending.set(key, fingerprint);
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
    }
    const z = db.prepare(
      "INSERT INTO zones(id,name,fee,active,delivery_minutes) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,fee=excluded.fee,active=excluded.active,delivery_minutes=excluded.delivery_minutes",
    );
    for (const x of state.zones) {
      const key = "z:" + x.id,
        fingerprint = JSON.stringify(x);
      if (written.get(key) === fingerprint) continue;
      pending.set(key, fingerprint);
      z.run(x.id, x.name, x.fee, Number(x.active), x.deliveryMinutes ?? 20);
    }
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
    const operations = JSON.stringify({
      settings: state.settings,
      ingredients: state.ingredients,
      closures: state.closures || [],
      categories: state.categories || [],
    });
    if (written.get("operations") !== operations) {
      pending.set("operations", operations);
      db.prepare("INSERT OR REPLACE INTO app_meta VALUES(?,?)").run("operations", operations);
    }
    if (audit)
      recordAudit(audit.actor, audit.action, audit.target, audit.details);
  }
}
