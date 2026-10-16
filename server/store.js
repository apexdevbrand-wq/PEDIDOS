import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
mkdirSync("data", { recursive: true });
const db = new DatabaseSync("data/orders.sqlite");
db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
if (
  !db
    .prepare("PRAGMA table_info(orders)")
    .all()
    .some((c) => c.name === "zone_id")
)
  db.exec("ALTER TABLE orders ADD COLUMN zone_id INTEGER REFERENCES zones(id)");
export function load() {
  const products = db
    .prepare("SELECT * FROM products")
    .all()
    .map((p) => ({ ...p, active: Boolean(p.active) }));
  if (!products.length) return null;
  const zones = db
    .prepare("SELECT * FROM zones")
    .all()
    .map((z) => ({ ...z, active: Boolean(z.active) }));
  const orders = db
    .prepare("SELECT * FROM orders ORDER BY created_at")
    .all()
    .map((o) => ({
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
      lines: db
        .prepare(
          "SELECT product_id AS id,product_name AS name,unit_price AS price,quantity,notes FROM order_items WHERE order_id=? ORDER BY position",
        )
        .all(o.id),
    }));
  return { products, zones, orders };
}
export function save(state) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const p = db.prepare(
      "INSERT OR REPLACE INTO products VALUES(?,?,?,?,?,?,?)",
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
      );
    const z = db.prepare("INSERT OR REPLACE INTO zones VALUES(?,?,?,?)");
    for (const x of state.zones) z.run(x.id, x.name, x.fee, Number(x.active));
    const o = db.prepare(
      "INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payment_status=excluded.payment_status,preference_id=excluded.preference_id,checkout_url=excluded.checkout_url,payment_id=excluded.payment_id,payment_error=excluded.payment_error",
    );
    const line = db.prepare(
      "INSERT OR IGNORE INTO order_items VALUES(?,?,?,?,?,?,?)",
    );
    for (const x of state.orders) {
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
      );
      x.lines.forEach((i, n) =>
        line.run(x.id, n, i.id, i.name, i.price, i.quantity, i.notes),
      );
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
