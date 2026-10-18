// Prueba de operación: pedidos simultáneos, dobles clics, cocina concurrente
// y reconexiones del tiempo real (SSE).
//
//   node scripts/stress.js --base http://127.0.0.1:3000 --user cocina --pass "..." \
//        [--orders 150] [--concurrency 30] [--sse 40]
//
// Úsala contra una copia de prueba, nunca contra la base real del negocio:
// crea pedidos de verdad (pago en efectivo, nombre "Prueba de carga").
import { randomUUID } from "node:crypto";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(" ")
    .split("--")
    .filter(Boolean)
    .map((a) => {
      const [k, ...v] = a.trim().split(" ");
      return [k, v.join(" ").replace(/^"|"$/g, "")];
    }),
);
const BASE = (args.base || "http://127.0.0.1:3000").replace(/\/$/, "");
const ORDERS = Number(args.orders || 150);
const CONCURRENCY = Number(args.concurrency || 30);
const SSE = Number(args.sse || 40);
const report = { base: BASE, orders: ORDERS, concurrency: CONCURRENCY, sse: SSE, checks: [] };
const check = (name, ok, detail = "") => {
  report.checks.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✖"} ${name}${detail ? " · " + detail : ""}`);
};
const pct = (list, p) => {
  const s = [...list].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]) : 0;
};
async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const n = i++;
        out[n] = await fn(items[n], n);
      }
    }),
  );
  return out;
}

// ── Clientes SSE: cuentan avisos recibidos ──
// Tiempo real: WebSocket (/api/live, Cloudflare) o SSE (/api/events, Node).
const LIVE = args.live || "auto";
let useWs = LIVE === "ws";
if (LIVE === "auto") {
  useWs = await new Promise((resolve) => {
    const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/api/live");
    ws.onopen = () => (ws.close(), resolve(true));
    ws.onerror = () => resolve(false);
  });
}
function openStream() {
  const state = { events: 0, closed: false };
  if (useWs) {
    const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/api/live");
    state.ctrl = { abort: () => ws.close() };
    state.done = new Promise((resolve) => {
      ws.onmessage = (e) => e.data === "update" && state.events++;
      ws.onclose = () => ((state.closed = true), resolve());
      ws.onerror = () => {};
    });
    state.ready = new Promise((r) => (ws.onopen = r));
    return state;
  }
  const ctrl = new AbortController();
  state.ctrl = ctrl;
  state.ready = Promise.resolve();
  state.done = fetch(BASE + "/api/events", { signal: ctrl.signal })
    .then(async (r) => {
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        state.events += (dec.decode(value).match(/data: update/g) || []).length;
      }
    })
    .catch(() => {})
    .finally(() => (state.closed = true));
  return state;
}

const catalog = await (await fetch(BASE + "/api/catalog")).json();
if (catalog.availability && !catalog.availability.open) {
  console.error("El negocio está cerrado o en pausa; abre la recepción para probar.");
  process.exit(2);
}
const simple = catalog.products.filter((p) => p.active && !(p.options || []).some((g) => g.min > 0));
if (!simple.length) {
  console.error("No hay productos sin opciones obligatorias para la prueba.");
  process.exit(2);
}
let streams = Array.from({ length: SSE }, openStream);
await Promise.all(streams.map((s) => s.ready));
await new Promise((r) => setTimeout(r, 500));

// ── Pedidos simultáneos con 20 % de dobles envíos de la misma compra ──
const bodies = Array.from({ length: ORDERS }, (_, n) => ({
  requestId: randomUUID(),
  name: "Prueba de carga " + n,
  phone: "55" + String(10000000 + n).slice(-8),
  delivery: "pickup",
  payment: "cash",
  items: [{ id: simple[n % simple.length].id, quantity: 1 + (n % 3) }],
}));
const jobs = bodies.flatMap((b, n) => (n % 5 === 0 ? [b, b] : [b]));
const latencies = [];
const t0 = Date.now();
const results = await pool(jobs, CONCURRENCY, async (b) => {
  const start = performance.now();
  const r = await fetch(BASE + "/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });
  latencies.push(performance.now() - start);
  return { requestId: b.requestId, status: r.status, body: await r.json().catch(() => ({})) };
});
const elapsed = (Date.now() - t0) / 1000;
const failures = results.filter((r) => ![200, 201].includes(r.status));
check("Todos los pedidos se aceptaron", !failures.length, failures.length ? `${failures.length} fallaron: ${JSON.stringify(failures[0].body)}` : `${results.length} solicitudes en ${elapsed.toFixed(1)} s`);
const byRequest = new Map();
for (const r of results) {
  if (!byRequest.has(r.requestId)) byRequest.set(r.requestId, new Set());
  if (r.body.id) byRequest.get(r.requestId).add(r.body.id);
}
check("Doble envío de la misma compra no duplica el pedido", [...byRequest.values()].every((s) => s.size === 1));
const ids = new Set(results.map((r) => r.body.id).filter(Boolean));
const folios = new Set(results.map((r) => r.body.folio).filter(Boolean));
check("Un folio único por compra", ids.size === ORDERS && folios.size === ORDERS, `${ids.size} pedidos, ${folios.size} folios`);
report.latencyMs = { p50: pct(latencies, 50), p95: pct(latencies, 95), max: pct(latencies, 100) };
check("Tiempo de respuesta p95 menor a 1.5 s", report.latencyMs.p95 < 1500, JSON.stringify(report.latencyMs));

// ── Cocina: aceptar todo en paralelo y carreras de doble aceptación ──
if (args.user && args.pass) {
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ username: args.user, password: args.pass }),
  });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  check("Inicio de sesión de cocina", login.ok, login.ok ? "" : String(login.status));
  if (login.ok) {
    const staff = (path, method = "GET", body) =>
      fetch(BASE + "/api" + path, {
        method,
        headers: { "Content-Type": "application/json", Cookie: cookie, Origin: BASE },
        body: body && JSON.stringify(body),
      });
    const mine = [...ids];
    const accepted = await pool(mine, CONCURRENCY, async (id) => {
      const [a, b] = await Promise.all([
        staff("/staff/orders/" + id, "PATCH", { status: "cooking", prepMinutes: 20 }),
        staff("/staff/orders/" + id, "PATCH", { status: "cooking", prepMinutes: 25 }),
      ]);
      return [a.status, b.status].sort().join(",");
    });
    check(
      "Dos tabletas aceptando el mismo pedido: solo una gana",
      accepted.every((s) => s === "200,409"),
      [...new Set(accepted)].join(" | "),
    );
    const done = await pool(mine, CONCURRENCY, async (id) => {
      const r1 = await staff("/staff/orders/" + id, "PATCH", { status: "ready" });
      const r2 = await staff("/staff/orders/" + id, "PATCH", { status: "completed" });
      return r1.ok && r2.ok;
    });
    check("Listo y entregado para todos los pedidos", done.every(Boolean));
    const all = await (await staff("/staff/orders")).json();
    const ours = all.filter((o) => ids.has(o.id));
    check(
      "Estado final consistente (entregado y cobrado en efectivo)",
      ours.length === ORDERS && ours.every((o) => o.status === "completed" && o.paymentStatus === "paid"),
    );
  }
} else console.log("· Sin --user/--pass: se omite la parte de cocina.");

// ── Tiempo real y reconexión ──
const alive = streams.filter((s) => !s.closed);
check("Conexiones en tiempo real activas", alive.length === SSE, `${alive.length}/${SSE}`);
check("Cada conexión recibió avisos", streams.every((s) => s.events > 0), `mínimo ${Math.min(...streams.map((s) => s.events))} avisos`);
const half = streams.slice(0, Math.floor(SSE / 2));
half.forEach((s) => s.ctrl.abort());
await Promise.all(half.map((s) => s.done));
const reopened = half.map(openStream);
await Promise.all(reopened.map((s) => s.ready));
await new Promise((r) => setTimeout(r, 300));
const health = await (await fetch(BASE + "/api/health")).json().catch(() => ({}));
check("El servidor libera conexiones cerradas", health.clients === undefined || health.clients <= SSE + 2, `clientes conectados: ${health.clients}`);
await fetch(BASE + "/api/orders", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...bodies[0], requestId: randomUUID(), name: "Prueba de carga reconexión" }),
});
await new Promise((r) => setTimeout(r, 500));
check("Clientes reconectados reciben avisos nuevos", reopened.every((s) => s.events > 0));
[...streams, ...reopened].forEach((s) => s.ctrl.abort());

report.ok = report.checks.every((c) => c.ok);
console.log(report.ok ? "\nResultado: todo correcto." : "\nResultado: hay fallas, revisa arriba.");
if (args.json) console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
