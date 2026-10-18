// Plataforma activa. La app corre igual en dos lugares:
//   - Node.js (server/index.js): SQLite en disco, fotos y respaldos en data/.
//   - Cloudflare (cloudflare/worker.js): un Durable Object con SQLite propio.
// Cada plataforma llama bind() al arrancar con sus implementaciones; los
// módulos de la app importan estas referencias (se actualizan solas).
//
// db       prepare(sql).run/get/all, exec(sql), transaction(fn)
// uploads  put(name, bytes, type), get(name) -> {body, type} | null, exists(name), list()
// backups  make(prefix), list(), read(name) -> {body, type} | null, prune()
// push     generateKeys() -> {publicKey, privateKey}, send(subscription, payload, {TTL})
// schedule every(name, ms, fn), kick(name, delayMs), soon(promise)
// realtime broadcast(), clients()
// limits   { maxUpload }
export let db, uploads, backups, push, schedule, realtime, limits, platform;
export function bind(p) {
  ({ db, uploads, backups, push, schedule, realtime, limits, platform } = p);
}
