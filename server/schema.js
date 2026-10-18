// Esquema SQLite compartido por Node y Cloudflare (sin PRAGMA: los
// Durable Objects no los permiten; Node los aplica aparte).
export const schema = `CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
 price INTEGER NOT NULL CHECK(price >= 0), description TEXT NOT NULL,
 image TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)), details_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS zones (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, fee INTEGER NOT NULL CHECK(fee >= 0),
 active INTEGER NOT NULL CHECK(active IN (0,1))
);
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, folio TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','cooking','ready','completed','rejected')),
 payment_status TEXT NOT NULL, customer_name TEXT NOT NULL, phone TEXT NOT NULL,
 address TEXT NOT NULL, zone_name TEXT, delivery TEXT NOT NULL, payment TEXT NOT NULL,
 subtotal INTEGER NOT NULL, shipping INTEGER NOT NULL, surcharge INTEGER NOT NULL,
 total INTEGER NOT NULL CHECK(total=subtotal+shipping+surcharge),
 preference_id TEXT, checkout_url TEXT, payment_id TEXT, payment_error INTEGER DEFAULT 0, zone_id INTEGER REFERENCES zones(id), details_json TEXT NOT NULL DEFAULT '{}', request_key TEXT
);
CREATE TABLE IF NOT EXISTS order_items (
 order_id TEXT NOT NULL REFERENCES orders(id), position INTEGER NOT NULL,
 product_id INTEGER NOT NULL REFERENCES products(id), product_name TEXT NOT NULL,
 unit_price INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), notes TEXT NOT NULL, options_json TEXT NOT NULL DEFAULT '{}',
 PRIMARY KEY(order_id,position)
);
CREATE INDEX IF NOT EXISTS orders_date_status ON orders(created_at,status);
CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,display_name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','staff')),active INTEGER NOT NULL DEFAULT 1,password_hash TEXT NOT NULL,salt TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY,created_at TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT,details TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS audit_date ON audit_log(created_at);
CREATE TABLE IF NOT EXISTS push_subscriptions (order_id TEXT NOT NULL REFERENCES orders(id),endpoint TEXT NOT NULL,subscription TEXT NOT NULL,PRIMARY KEY(order_id,endpoint));
CREATE TABLE IF NOT EXISTS push_jobs (id TEXT PRIMARY KEY,order_id TEXT NOT NULL,payload TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'queued',created_at TEXT NOT NULL,last_error TEXT);

CREATE INDEX IF NOT EXISTS push_jobs_status ON push_jobs(status,created_at);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,version INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires);
`;
