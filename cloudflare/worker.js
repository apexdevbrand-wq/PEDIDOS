// Los Santos en Cloudflare (plan gratis): la interfaz se sirve como archivos
// estáticos y toda la API corre en un único Durable Object "Tienda" con su
// propia base SQLite. El tiempo real usa WebSocket con hibernación, así el
// objeto no consume tiempo mientras nadie hace pedidos.
import { DurableObject } from "cloudflare:workers";
import { bind } from "../server/runtime.js";
import { migrate, getMeta, setMeta, forgetWrites, recordAudit } from "../server/store-core.js";
import { actorOf, resetOwnerFromEnvironment } from "../server/auth.js";
import { createHash } from "node:crypto";
import { forgetPushKeys } from "../server/push.js";
import { createRouter } from "./router.js";
import { generateVapidKeys, sendNotification } from "./webpush.js";

const SQL_ROW_LIMIT = 1_900_000; // filas de hasta 2 MB en Durable Objects

function sqlDatabase(ctx) {
  const sql = ctx.storage.sql;
  const clean = (args) =>
    args.map((v) =>
      v === undefined ? null : typeof v === "boolean" ? Number(v) : v instanceof Uint8Array ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : v,
    );
  return {
    prepare(query) {
      return {
        run: (...args) => {
          const cursor = sql.exec(query, ...clean(args));
          cursor.toArray();
          return { changes: cursor.rowsWritten };
        },
        get: (...args) => sql.exec(query, ...clean(args)).toArray()[0],
        all: (...args) => sql.exec(query, ...clean(args)).toArray(),
      };
    },
    exec: (query) => sql.exec(query),
    transaction: (fn) => ctx.storage.transactionSync(fn),
  };
}

function platform(ctx, env) {
  const db = sqlDatabase(ctx);
  const tasks = new Map();
  const readSchedule = () => getMeta("schedule", {});
  async function arm() {
    const next = Object.values(readSchedule());
    if (!next.length) return;
    const at = Math.max(Date.now() + 1000, Math.min(...next));
    const current = await ctx.storage.getAlarm();
    if (current === null || current > at || current < Date.now()) await ctx.storage.setAlarm(at);
  }
  const plan = (name, at) => {
    const s = readSchedule();
    if (s[name] && s[name] <= at && s[name] > Date.now()) return;
    s[name] = at;
    setMeta("schedule", s);
    ctx.waitUntil(arm());
  };
  const types = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
  return {
    platform: "cloudflare",
    db,
    tasks,
    arm,
    limits: { maxUpload: SQL_ROW_LIMIT },
    uploads: {
      put(name, body, type) {
        db.prepare("INSERT INTO uploads(name,type,body,created_at) VALUES(?,?,?,?)").run(name, type || types[name.split(".").pop()], body, new Date().toISOString());
      },
      exists: (name) => Boolean(db.prepare("SELECT 1 AS ok FROM uploads WHERE name=?").get(name)),
      get(name) {
        const row = db.prepare("SELECT type, body FROM uploads WHERE name=?").get(name);
        return row ? { type: row.type, body: new Uint8Array(row.body) } : null;
      },
      list: () => db.prepare("SELECT name FROM uploads ORDER BY created_at").all().map((r) => r.name),
    },
    backups: {
      // Respaldo = exportación JSON de todas las tablas (sin fotos ni
      // sesiones), guardada en partes dentro de la propia base.
      async make(prefix = "manual") {
        const tables = ["products", "zones", "orders", "order_items", "app_meta", "users", "audit_log", "push_subscriptions", "push_jobs"];
        const data = { format: "los-santos-backup", version: 1, createdAt: new Date().toISOString(), tables: {} };
        for (const t of tables) data.tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
        data.tables.app_meta = data.tables.app_meta.filter((r) => r.key !== "schedule");
        const text = JSON.stringify(data);
        const name = `${prefix}-${data.createdAt.replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 6)}.json`;
        db.transaction(() => {
          for (let i = 0, part = 0; i < text.length; i += 500_000, part++)
            db.prepare("INSERT INTO backup_parts VALUES(?,?,?)").run(name, part, text.slice(i, i + 500_000));
          db.prepare("INSERT INTO backups VALUES(?,?,?)").run(name, data.createdAt, new TextEncoder().encode(text).byteLength);
        });
        return { name, createdAt: data.createdAt, size: new TextEncoder().encode(text).byteLength };
      },
      list: () => db.prepare("SELECT name, created_at AS createdAt, size FROM backups ORDER BY created_at DESC").all(),
      read(name) {
        if (!db.prepare("SELECT 1 AS ok FROM backups WHERE name=?").get(name)) return null;
        const text = db
          .prepare("SELECT data FROM backup_parts WHERE name=? ORDER BY part")
          .all(name)
          .map((r) => r.data)
          .join("");
        return { body: new TextEncoder().encode(text), type: "application/json" };
      },
      prune() {
        const keep = { "auto-": 28, "pre-upgrade-": 4 };
        for (const [prefix, n] of Object.entries(keep))
          for (const old of db.prepare("SELECT name FROM backups WHERE name LIKE ? ORDER BY created_at DESC").all(prefix + "%").slice(n)) {
            db.prepare("DELETE FROM backup_parts WHERE name=?").run(old.name);
            db.prepare("DELETE FROM backups WHERE name=?").run(old.name);
          }
      },
    },
    push: { generateKeys: generateVapidKeys, send: sendNotification },
    schedule: {
      every(name, ms, fn) {
        tasks.set(name, { ms, fn });
        if (!readSchedule()[name]) plan(name, Date.now() + ms);
        else ctx.waitUntil(arm());
      },
      kick: (name, delay = 0) => plan(name, Date.now() + delay),
      soon: (promise) => ctx.waitUntil(Promise.resolve(promise).catch(() => {})),
    },
    realtime: {
      broadcast() {
        for (const ws of ctx.getWebSockets())
          try {
            ws.send("update");
          } catch {}
      },
      clients: () => ctx.getWebSockets().length,
    },
  };
}

export class Tienda extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Variables y secretos de Cloudflare disponibles como process.env.
    for (const [k, v] of Object.entries(env)) if (typeof v === "string") process.env[k] = v;
    process.env.TRUST_PROXY ??= "cloudflare";
    this.platform = platform(ctx, env);
    this.app = createRouter();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      bind(this.platform);
      migrate();
      this.platform.db.exec(
        "CREATE TABLE IF NOT EXISTS uploads (name TEXT PRIMARY KEY, type TEXT NOT NULL, body BLOB NOT NULL, created_at TEXT NOT NULL);" +
          "CREATE TABLE IF NOT EXISTS backups (name TEXT PRIMARY KEY, created_at TEXT NOT NULL, size INTEGER NOT NULL);" +
          "CREATE TABLE IF NOT EXISTS backup_parts (name TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(name, part));",
      );
      const { createApp } = await import("../server/app.js");
      await createApp(this.app, { raw: this.app.raw });
      // Recuperar el acceso del dueño con el secreto OWNER_RESET_PASSWORD
      // (se aplica una sola vez por cada contraseña distinta).
      const reset = env.OWNER_RESET_PASSWORD;
      if (reset) {
        const mark = createHash("sha256").update("reset:" + reset).digest("hex");
        if (getMeta("owner_reset") !== mark) {
          try {
            await resetOwnerFromEnvironment(reset);
            setMeta("owner_reset", mark);
          } catch (e) {
            console.error("OWNER_RESET_PASSWORD:", e.message);
          }
        }
      }
    });
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/live") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Se esperaba WebSocket", { status: 426 });
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (url.pathname === "/api/staff/backups/restore" && request.method === "POST") return this.restore(request);
    return this.app.handle(request);
  }
  // Restaura un respaldo .json descargado desde Administración → Respaldos.
  async restore(request) {
    const json = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    const headers = Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v]));
    const text = await request.text(); // leer siempre el cuerpo antes de responder
    if (headers.origin && new URL(headers.origin).host !== headers.host) return json(403, { error: "Origen no permitido" });
    const actor = actorOf({ headers });
    if (!actor) return json(401, { error: "Inicia sesión como personal" });
    if (actor.role !== "owner") return json(403, { error: "No tienes permisos para esta acción" });
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return json(400, { error: "El archivo no es un respaldo válido (.json)." });
    }
    const tables = ["products", "zones", "orders", "order_items", "app_meta", "users", "audit_log", "push_subscriptions", "push_jobs"];
    if (data?.format !== "los-santos-backup" || !tables.every((t) => Array.isArray(data.tables?.[t])) || !data.tables.users.some((u) => u.role === "owner" && u.active))
      return json(400, { error: "El archivo no es un respaldo de Los Santos o no tiene un dueño activo." });
    const db = this.platform.db;
    const before = await this.platform.backups.make("pre-restore");
    try {
      db.transaction(() => {
        for (const t of [...tables].reverse()) db.prepare(`DELETE FROM ${t}`).run();
        db.prepare("DELETE FROM sessions").run();
        for (const t of tables)
          for (const row of data.tables[t]) {
            const cols = Object.keys(row).filter((c) => /^\w+$/.test(c));
            db.prepare(`INSERT INTO ${t}(${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")})`).run(...cols.map((c) => row[c]));
          }
        recordAudit(actor, "backup.restored", before.name, { from: data.createdAt });
      });
    } catch (e) {
      return json(400, { error: "No se pudo restaurar: " + e.message + ". La base no cambió." });
    }
    forgetWrites();
    forgetPushKeys();
    // Reinicia el objeto para que la próxima petición cargue la base restaurada.
    setTimeout(() => this.ctx.abort("respaldo restaurado"), 50);
    return json(200, { restored: true, previous: before.name });
  }
  webSocketMessage() {}
  webSocketClose(ws, code) {
    try {
      ws.close(code === 1005 ? 1000 : code, "adiós");
    } catch {}
  }
  webSocketError() {}
  async alarm() {
    const due = getMeta("schedule", {});
    const now = Date.now();
    for (const [name, at] of Object.entries(due)) {
      if (at > now + 500) continue;
      const task = this.platform.tasks.get(name);
      let again = true;
      try {
        if (task) again = (await task.fn()) !== false;
      } catch (e) {
        console.error("Tarea " + name + " falló:", e?.message);
      }
      const s = getMeta("schedule", {});
      if (again && task) s[name] = Date.now() + task.ms;
      else delete s[name];
      setMeta("schedule", s);
    }
    await this.platform.arm();
  }
}

// Entrada pública: archivos de la interfaz, API y fotos.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) {
      const stub = env.TIENDA.get(env.TIENDA.idFromName("los-santos"));
      return stub.fetch(request);
    }
    // Rutas de la app (/, /personal…) devuelven la interfaz; archivos
    // inexistentes con extensión devuelven 404.
    if (!/\.[a-z0-9]+$/i.test(url.pathname)) {
      const page = await env.ASSETS.fetch(new Request(new URL("/", url), request));
      const res = new Response(page.body, page);
      if (url.pathname.startsWith("/personal")) {
        res.headers.set("Cache-Control", "no-store");
        res.headers.set("X-Robots-Tag", "noindex, nofollow");
      }
      return res;
    }
    return new Response("No encontrado", { status: 404 });
  },
};
