import { randomBytes, timingSafeEqual } from "node:crypto";
const sessions = new Map();
const TTL = 8 * 60 * 60 * 1000;
function equal(actual, expected) {
  return (
    typeof actual === "string" &&
    Boolean(expected) &&
    Buffer.byteLength(actual) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  );
}
function tokenRole(token) {
  const staff = process.env.STAFF_TOKEN,
    owner = process.env.OWNER_TOKEN;
  if (staff && owner && staff === owner) return null;
  if (equal(token, owner)) return "owner";
  if (equal(token, staff)) return "staff";
  return null;
}
function sessionId(req) {
  return String(req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("santos_session="))
    ?.slice("santos_session=".length);
}
export function roleOf(req) {
  const bearer = req.headers.authorization?.replace(/^Bearer /, "");
  if (bearer) return tokenRole(bearer);
  const id = sessionId(req),
    session = sessions.get(id);
  if (!session) return null;
  if (session.expires <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  return session.role;
}
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
    const role = roleOf(req);
    if (!role)
      return res.status(401).json({ error: "Inicia sesión como personal" });
    if (!allowed.includes(role))
      return res
        .status(403)
        .json({ error: "No tienes permisos para esta acción" });
    req.role = role;
    next();
  };
}
export function registerAuth(app) {
  app.use("/api/auth", (_, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/auth/session", (req, res) =>
    res.json({ role: roleOf(req) || "customer" }),
  );
  app.post("/api/auth/login", sameOrigin, (req, res) => {
    const role = tokenRole(req.body?.token);
    if (!role)
      return res
        .status(401)
        .json({ error: "Clave de acceso incorrecta o no configurada" });
    for (const [id, session] of sessions)
      if (session.expires <= Date.now()) sessions.delete(id);
    const previous = sessionId(req);
    if (previous) sessions.delete(previous);
    const id = randomBytes(32).toString("hex");
    sessions.set(id, { role, expires: Date.now() + TTL });
    res.set("Set-Cookie", cookie(id, TTL / 1000));
    res.json({ role });
  });
  app.post("/api/auth/logout", sameOrigin, (req, res) => {
    sessions.delete(sessionId(req));
    res.set("Set-Cookie", cookie("", 0));
    res.json({ role: "customer" });
  });
}
