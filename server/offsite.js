// Copia de respaldos fuera del servidor en almacenamiento compatible con S3
// (Cloudflare R2: 10 GB gratis, sin cobro por descarga). Firma AWS SigV4
// implementada con node:crypto, sin dependencias.
import { createHash, createHmac } from "node:crypto";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
const encodePath = (p) =>
  p
    .split("/")
    .map((s) =>
      encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()),
    )
    .join("/");

export function signV4({ method, url, headers = {}, body = "", accessKeyId, secretAccessKey, region, service = "s3", date = new Date() }) {
  const u = new URL(url);
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const payloadHash = headers["x-amz-content-sha256"] || sha256(body);
  const all = {
    ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])),
    host: u.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const names = Object.keys(all).sort();
  const query = [...u.searchParams.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => k + "=" + v)
    .join("&");
  const canonical = [
    method,
    encodePath(decodeURIComponent(u.pathname)),
    query,
    names.map((n) => n + ":" + all[n] + "\n").join(""),
    names.join(";"),
    payloadHash,
  ].join("\n");
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac("AWS4" + secretAccessKey, day), region), service), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return {
    ...all,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
  };
}

export function offsiteConfig(env = process.env) {
  const endpoint = (env.BACKUP_S3_ENDPOINT || "").replace(/\/$/, "");
  const ok =
    endpoint &&
    env.BACKUP_S3_BUCKET &&
    env.BACKUP_S3_ACCESS_KEY_ID &&
    env.BACKUP_S3_SECRET_ACCESS_KEY &&
    (/^https:\/\//.test(endpoint) || /^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint));
  if (!ok) return null;
  return {
    endpoint,
    bucket: env.BACKUP_S3_BUCKET,
    accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID,
    secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY,
    region: env.BACKUP_S3_REGION || "auto",
    prefix: (env.BACKUP_S3_PREFIX || "los-santos/").replace(/^\/+/, ""),
  };
}

export async function putObject(cfg, key, body, contentType = "application/octet-stream") {
  const url = `${cfg.endpoint}/${cfg.bucket}/${encodePath(cfg.prefix + key)}`;
  const headers = signV4({
    method: "PUT",
    url,
    body,
    headers: { "content-type": contentType },
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    region: cfg.region,
  });
  delete headers.host;
  const r = await fetch(url, { method: "PUT", headers, body, signal: AbortSignal.timeout(120000) });
  if (!r.ok) {
    const text = (await r.text().catch(() => "")).slice(0, 200);
    throw Error(`El almacenamiento externo respondió ${r.status}${text ? ": " + text.replace(/\s+/g, " ") : ""}`);
  }
}

// Sube el respaldo indicado y las fotos que aún no estén fuera del servidor.
// readBackup / readUpload devuelven { body, type } según la plataforma.
export async function shipBackup({ backupName, readBackup, uploadNames, readUpload, getMeta, setMeta }) {
  const cfg = offsiteConfig();
  if (!cfg) return { skipped: true };
  const status = getMeta("offsite", {});
  const shipped = new Set(getMeta("offsite_uploads", []));
  try {
    const file = readBackup(backupName);
    if (!file) throw Error("No se encontró el respaldo " + backupName);
    await putObject(cfg, "backups/" + backupName, file.body, file.type);
    let photos = 0;
    for (const name of uploadNames) {
      if (shipped.has(name)) continue;
      const photo = readUpload(name);
      if (!photo) continue;
      await putObject(cfg, "uploads/" + name, photo.body, photo.type);
      shipped.add(name);
      photos++;
    }
    setMeta("offsite_uploads", [...shipped]);
    const next = { ...status, lastOkAt: new Date().toISOString(), lastBackup: backupName, lastError: null, photos: shipped.size };
    setMeta("offsite", next);
    return { ok: true, photos };
  } catch (e) {
    setMeta("offsite", { ...status, lastErrorAt: new Date().toISOString(), lastError: e.message });
    throw e;
  }
}
