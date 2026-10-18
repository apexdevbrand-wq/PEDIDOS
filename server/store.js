// Plataforma Node.js: SQLite en data/orders.sqlite, fotos en data/uploads y
// respaldos .sqlite en data/backups. Registra sus implementaciones en
// runtime.js y vuelve a exportar las funciones de store-core.js.
import { DatabaseSync, backup } from "node:sqlite";
import {
  mkdirSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import webpush from "web-push";
import { bind } from "./runtime.js";
import { migrate } from "./store-core.js";
export * from "./store-core.js";

mkdirSync("data/backups", { recursive: true });
mkdirSync("data/uploads", { recursive: true });
const existed = existsSync("data/orders.sqlite");
const sqlite = new DatabaseSync("data/orders.sqlite");
sqlite.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
export const db = {
  prepare: (sql) => sqlite.prepare(sql),
  exec: (sql) => sqlite.exec(sql),
  transaction(fn) {
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      sqlite.exec("COMMIT");
      return result;
    } catch (e) {
      sqlite.exec("ROLLBACK");
      throw e;
    }
  },
};

const BACKUPS = "data/backups";
const backupPattern = /^(auto|manual|pre-upgrade)-[\w.-]+\.sqlite$/;
async function makeBackup(prefix = "manual") {
  const name = `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 6)}.sqlite`;
  const temporary = join(BACKUPS, name + ".tmp");
  try {
    await backup(sqlite, temporary);
    renameSync(temporary, join(BACKUPS, name));
    return {
      name,
      createdAt: new Date().toISOString(),
      size: statSync(join(BACKUPS, name)).size,
    };
  } catch (e) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw e;
  }
}
function listBackups() {
  return readdirSync(BACKUPS)
    .filter((n) => backupPattern.test(n))
    .map((name) => {
      const stat = statSync(join(BACKUPS, name));
      return { name, createdAt: stat.mtime.toISOString(), size: stat.size };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function pruneBackups() {
  for (const item of listBackups()
    .filter((x) => x.name.startsWith("auto-"))
    .slice(56))
    unlinkSync(join(BACKUPS, item.name));
  for (const item of listBackups()
    .filter((x) => x.name.startsWith("pre-upgrade-"))
    .slice(14))
    unlinkSync(join(BACKUPS, item.name));
}

const UPLOADS = "data/uploads";
const uploadPattern = /^[\w-]+\.(jpg|png|webp)$/;
const types = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

const sse = new Set();
bind({
  platform: "node",
  db,
  limits: { maxUpload: 3 * 1024 * 1024 },
  uploads: {
    put: (name, body) => writeFileSync(join(UPLOADS, name), body, { flag: "wx" }),
    exists: (name) => uploadPattern.test(name) && existsSync(join(UPLOADS, name)),
    get(name) {
      if (!uploadPattern.test(name) || !existsSync(join(UPLOADS, name))) return null;
      return { body: readFileSync(join(UPLOADS, name)), type: types[name.split(".").pop()] };
    },
    list: () => readdirSync(UPLOADS).filter((n) => uploadPattern.test(n)),
  },
  backups: {
    make: makeBackup,
    list: listBackups,
    prune: pruneBackups,
    read(name) {
      if (!listBackups().some((b) => b.name === name)) return null;
      return { body: readFileSync(join(BACKUPS, name)), type: "application/vnd.sqlite3" };
    },
  },
  push: {
    generateKeys: () => webpush.generateVAPIDKeys(),
    send: (subscription, payload, { TTL, publicKey, privateKey, subject }) =>
      webpush.sendNotification(subscription, payload, {
        TTL,
        timeout: 10000,
        vapidDetails: { subject, publicKey, privateKey },
      }),
  },
  schedule: {
    every(_name, ms, fn) {
      const timer = setInterval(() => void Promise.resolve(fn()).catch(() => {}), ms);
      timer.unref();
    },
    kick() {},
    soon: (promise) => void Promise.resolve(promise).catch(() => {}),
  },
  realtime: {
    add: (res) => sse.add(res),
    remove: (res) => sse.delete(res),
    broadcast() {
      for (const c of sse) c.write("data: update\n\n");
    },
    clients: () => sse.size,
  },
});
if (existed) await makeBackup("pre-upgrade");
migrate();
