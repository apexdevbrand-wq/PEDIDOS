PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
 price INTEGER NOT NULL CHECK(price >= 0), description TEXT NOT NULL,
 image TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1))
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
 preference_id TEXT, checkout_url TEXT, payment_id TEXT, payment_error INTEGER DEFAULT 0, zone_id INTEGER REFERENCES zones(id)
);
CREATE TABLE IF NOT EXISTS order_items (
 order_id TEXT NOT NULL REFERENCES orders(id), position INTEGER NOT NULL,
 product_id INTEGER NOT NULL REFERENCES products(id), product_name TEXT NOT NULL,
 unit_price INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), notes TEXT NOT NULL,
 PRIMARY KEY(order_id,position)
);
CREATE INDEX IF NOT EXISTS orders_date_status ON orders(created_at,status);
