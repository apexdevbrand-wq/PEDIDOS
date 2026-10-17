import {
  randomBytes,
  randomUUID,
  timingSafeEqual,
  scrypt as derive,
} from "node:crypto";
import { promisify } from "node:util";
import { db, recordAudit } from "./store.js";
const scrypt = promisify(derive),
  sessions = new Map(),
  legacy = new Map(),
  attempts = new Map(),
  TTL = 8 * 60 * 60 * 1000;
const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  displayName: u.display_name,
  role: u.role,
  active: Boolean(u.active),
  createdAt: u.created_at,
});
const byId = (id) => db.prepare("SELECT * FROM users WHERE id=?").get(id);
const byName = (name) =>
  db.prepare("SELECT * FROM users WHERE username=?").get(
    String(name || "")
      .trim()
      .toLowerCase(),
  );
async function passwordHash(password, salt) {
  return Buffer.from(
    await scrypt(password, salt, 64, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    }),
  ).toString("hex");
}
async function verify(password, user) {
  const hash = await passwordHash(
    String(password || ""),
    user?.salt || "invalid-account",
  );
  return (
    Boolean(user) &&
    timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(user.password_hash, "hex"),
    )
  );
}
export async function createUser(
  { username, displayName, password, role },
  bootstrap = false,
) {
  username = String(username || "")
    .trim()
    .toLowerCase();
  if (
    !/^[a-z0-9._-]{3,40}$/.test(username) ||
    typeof displayName !== "string" ||
    !displayName.trim() ||
    displayName.length > 80 ||
    !["owner", "staff"].includes(role) ||
    typeof password !== "string" ||
    password.length < (bootstrap ? 8 : 12) ||
    password.length > 256
  )
    throw Error(
      "Usuario válido, nombre y contraseña de al menos 12 caracteres son obligatorios",
    );
  if (byName(username)) throw Error("Ese usuario ya existe");
  const salt = randomBytes(16).toString("hex"),
    id = randomUUID(),
    hash = await passwordHash(password, salt);
  db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?)").run(
    id,
    username,
    displayName.trim(),
    role,
    1,
    hash,
    salt,
    1,
    new Date().toISOString(),
  );
  return publicUser(byId(id));
}
export async function initializeUsers() {
  if (!db.prepare("SELECT id FROM users LIMIT 1").get()) {
    const owner = process.env.OWNER_PASSWORD || process.env.OWNER_TOKEN;
    if (owner) {
      await createUser(
        {
          username: process.env.OWNER_USERNAME || "dueno",
          displayName: "Dueño",
          password: owner,
          role: "owner",
        },
        true,
      );
      const staff = process.env.STAFF_PASSWORD || process.env.STAFF_TOKEN;
      if (staff && staff !== owner)
        await createUser(
          {
            username: process.env.STAFF_USERNAME || "cocina",
            displayName: "Cocina",
            password: staff,
            role: "staff",
          },
          true,
        );
    }
  }
  for (const [role, token, username] of [
    ["owner", process.env.OWNER_TOKEN, process.env.OWNER_USERNAME || "dueno"],
    ["staff", process.env.STAFF_TOKEN, process.env.STAFF_USERNAME || "cocina"],
  ]) {
    if (!token || process.env.OWNER_TOKEN === process.env.STAFF_TOKEN) continue;
    const u = byName(username);
    if (u?.active && u.role === role && (await verify(token, u)))
      legacy.set(token, { id: u.id, version: u.version });
  }
}
function sessionId(req) {
  return String(req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("santos_session="))
    ?.slice(15);
}
export function actorOf(req) {
  let session;
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (token) {
    for (const [credential, value] of legacy) {
      if (
        Buffer.byteLength(token) === Buffer.byteLength(credential) &&
        timingSafeEqual(Buffer.from(token), Buffer.from(credential))
      ) {
        session = value;
        break;
      }
    }
  } else {
    const id = sessionId(req);
    session = sessions.get(id);
    if (session?.expires <= Date.now()) {
      sessions.delete(id);
      session = null;
    }
  }
  if (!session) return null;
  const u = byId(session.id);
  if (!u?.active || u.version !== session.version) return null;
  return publicUser(u);
}
export const roleOf = (req) => actorOf(req)?.role || null;
function cookie(value, maxAge) {
  return `santos_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export function sameOrigin(req, res, next) {
  if (req.headers.origin) {
    let host;
    try {
      host = new URL(req.headers.origin).host;
    } catch {
      return res.status(403).json({ error: "Origen no permitido" });
    }
    if (host !== req.headers.host)
      return res.status(403).json({ error: "Origen no permitido" });
  }
  next();
}
export function requireRole(...allowed) {
  return (req, res, next) => {
    const actor = actorOf(req);
    if (!actor)
      return res.status(401).json({ error: "Inicia sesión como personal" });
    if (!allowed.includes(actor.role))
      return res
        .status(403)
        .json({ error: "No tienes permisos para esta acción" });
    req.actor = actor;
    req.role = actor.role;
    next();
  };
}
export function registerAuth(app) {
  app.use("/api/auth", (_, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/auth/session", (req, res) => {
    const actor = actorOf(req);
    res.json({ role: actor?.role || "customer", user: actor });
  });
  app.post("/api/auth/login", sameOrigin, async (req, res) => {
    // Detrás de Caddy o Cloudflare Tunnel todas las conexiones llegan desde
    // el proxy; con TRUST_PROXY=1 se usa la IP real del cliente.
    // TRUST_PROXY=1: último salto de X-Forwarded-For (lo añade Caddy).
    // TRUST_PROXY=cloudflare: cabecera CF-Connecting-IP de Cloudflare Tunnel.
    const forwarded =
      process.env.TRUST_PROXY === "cloudflare"
        ? String(req.headers["cf-connecting-ip"] || "").trim()
        : process.env.TRUST_PROXY === "1"
          ? String(req.headers["x-forwarded-for"] || "")
              .split(",")
              .at(-1)
              .trim()
          : "";
    const ip =
      (forwarded || req.socket.remoteAddress || "unknown") +
      "|" +
      String(req.body?.username || "").trim().toLowerCase().slice(0, 40);
    let attempt = attempts.get(ip);
    if (attempt && attempt.until < Date.now()) {
      attempts.delete(ip);
      attempt = null;
    }
    if (attempt?.count >= 10)
      return res
        .status(429)
        .json({ error: "Demasiados intentos. Espera 15 minutos." });
    try {
      let user;
      const token = req.body?.token;
      if (typeof token === "string") {
        const actor = actorOf({
          headers: { authorization: "Bearer " + token },
        });
        user = actor && byId(actor.id);
      } else {
        const candidate = byName(req.body?.username);
        if (
          typeof req.body?.password === "string" &&
          req.body.password.length <= 256 &&
          (await verify(req.body.password, candidate))
        )
          user = candidate;
      }
      if (!user?.active) {
        attempts.set(ip, {
          count: (attempt?.count || 0) + 1,
          until: attempt?.until || Date.now() + 15 * 60 * 1000,
        });
        return res.status(401).json({
          error: "Usuario o contraseña incorrectos, o acceso no configurado",
        });
      }
      attempts.delete(ip);
      for (const [id, s] of sessions)
        if (s.expires <= Date.now()) sessions.delete(id);
      sessions.delete(sessionId(req));
      const id = randomBytes(32).toString("hex");
      sessions.set(id, {
        id: user.id,
        version: user.version,
        expires: Date.now() + TTL,
      });
      res.set("Set-Cookie", cookie(id, TTL / 1000));
      recordAudit(publicUser(user), "session.login", user.id);
      res.json({ role: user.role, user: publicUser(user) });
    } catch {
      res.status(500).json({ error: "No fue posible iniciar sesión" });
    }
  });
  app.post("/api/auth/logout", sameOrigin, (req, res) => {
    const actor = actorOf(req);
    sessions.delete(sessionId(req));
    res.set("Set-Cookie", cookie("", 0));
    if (actor) recordAudit(actor, "session.logout", actor.id);
    res.json({ role: "customer" });
  });
}
export function registerUserRoutes(app, ownerAccess) {
  app.get("/api/staff/users", ownerAccess, (_, res) =>
    res.json(
      db
        .prepare("SELECT * FROM users ORDER BY created_at")
        .all()
        .map(publicUser),
    ),
  );
  app.post("/api/staff/users", ownerAccess, async (req, res) => {
    try {
      const user = await createUser(req.body);
      recordAudit(req.actor, "user.created", user.id, {
        username: user.username,
        role: user.role,
      });
      res.status(201).json(user);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.patch("/api/staff/users/:id", ownerAccess, async (req, res) => {
    const user = byId(req.params.id);
    if (!user) return res.sendStatus(404);
    const b = req.body;
    if (
      (b.active !== undefined && typeof b.active !== "boolean") ||
      (b.role !== undefined && !["staff", "owner"].includes(b.role)) ||
      (b.displayName !== undefined &&
        (typeof b.displayName !== "string" ||
          !b.displayName.trim() ||
          b.displayName.length > 80))
    )
      return res.status(400).json({ error: "Datos de usuario inválidos" });
    if (
      user.role === "owner" &&
      user.active &&
      (b.active === false || b.role === "staff") &&
      db
        .prepare(
          "SELECT count(*) AS n FROM users WHERE role='owner' AND active=1",
        )
        .get().n <= 1
    )
      return res
        .status(409)
        .json({ error: "Debe permanecer al menos un dueño activo" });
    try {
      let hash = user.password_hash,
        salt = user.salt;
      if (b.password !== undefined) {
        if (
          typeof b.password !== "string" ||
          b.password.length < 12 ||
          b.password.length > 256
        )
          throw Error("La contraseña debe tener 12 a 256 caracteres");
        salt = randomBytes(16).toString("hex");
        hash = await passwordHash(b.password, salt);
      }
      const latest = byId(user.id);
      if (latest.version !== user.version)
        return res.status(409).json({
          error: "El usuario cambió. Actualiza la lista antes de guardar.",
        });
      if (
        latest.role === "owner" &&
        latest.active &&
        (b.active === false || b.role === "staff") &&
        db
          .prepare(
            "SELECT count(*) AS n FROM users WHERE role='owner' AND active=1",
          )
          .get().n <= 1
      )
        return res
          .status(409)
          .json({ error: "Debe permanecer al menos un dueño activo" });
      db.prepare(
        "UPDATE users SET display_name=?,role=?,active=?,password_hash=?,salt=?,version=version+1 WHERE id=?",
      ).run(
        b.displayName?.trim() || user.display_name,
        b.role || user.role,
        b.active === undefined ? user.active : Number(b.active),
        hash,
        salt,
        user.id,
      );
      recordAudit(req.actor, "user.updated", user.id, {
        role: b.role,
        active: b.active,
        passwordChanged: b.password !== undefined,
      });
      res.json(publicUser(byId(user.id)));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.get("/api/staff/audit", ownerAccess, (_, res) =>
    res.json(
      db
        .prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200")
        .all()
        .map((a) => ({ ...a, details: JSON.parse(a.details) })),
    ),
  );
}
export async function resetOwnerFromEnvironment() {
  const username = process.env.OWNER_USERNAME || "dueno",
    password = process.env.OWNER_PASSWORD || process.env.OWNER_TOKEN;
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 256
  )
    throw Error(
      "Configura OWNER_PASSWORD con 12 a 256 caracteres en .env antes de recuperar la cuenta.",
    );
  let user = byName(username);
  if (!user) {
    await createUser({
      username,
      displayName: "Dueño",
      password,
      role: "owner",
    });
    return;
  }
  const salt = randomBytes(16).toString("hex"),
    hash = await passwordHash(password, salt);
  db.prepare(
    "UPDATE users SET role='owner',active=1,password_hash=?,salt=?,version=version+1 WHERE id=?",
  ).run(hash, salt, user.id);
  recordAudit("terminal local", "user.recovered", user.id);
}
