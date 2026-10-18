// Enrutador mínimo con la misma forma que Express (app.get/post/use,
// req.params/query/body, res.status().json()). Permite que las rutas de
// server/*.js corran sin cambios dentro de un Durable Object de Cloudflare.
const STATUS_TEXT = { 200: "OK", 201: "Created", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 409: "Conflict", 413: "Payload Too Large", 429: "Too Many Requests", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable" };

function compile(path, prefix) {
  if (path instanceof RegExp) return { regex: path, keys: [] };
  const keys = [];
  const pattern = path
    .replace(/\/$/, "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:(\w+)/g, (_, key) => {
      keys.push(key);
      return "([^/]+)";
    });
  return { regex: new RegExp("^" + pattern + (prefix ? "(?:/.*)?$" : "/?$")), keys };
}

class Response$ {
  constructor() {
    this.statusCode = 200;
    this.headers = new Headers();
    this.body = null;
    this.finished = false;
  }
  status(code) {
    this.statusCode = code;
    return this;
  }
  set(name, value) {
    if (typeof name === "object") for (const [k, v] of Object.entries(name)) this.set(k, v);
    else if (name.toLowerCase() === "set-cookie") this.headers.append(name, value);
    else this.headers.set(name, value);
    return this;
  }
  get(name) {
    return this.headers.get(name);
  }
  json(value) {
    if (!this.headers.has("Content-Type")) this.headers.set("Content-Type", "application/json; charset=utf-8");
    return this.send(JSON.stringify(value));
  }
  send(body) {
    if (typeof body === "string" && !this.headers.has("Content-Type"))
      this.headers.set("Content-Type", "text/html; charset=utf-8");
    this.body = body ?? null;
    this.finished = true;
    return this;
  }
  sendStatus(code) {
    this.statusCode = code;
    this.headers.set("Content-Type", "text/plain; charset=utf-8");
    return this.send(STATUS_TEXT[code] || String(code));
  }
  end(body) {
    return this.send(body ?? null);
  }
  toResponse() {
    const body = this.statusCode === 204 || this.statusCode === 304 ? null : this.body;
    return new Response(body, { status: this.statusCode, headers: this.headers });
  }
}

export function createRouter({ jsonLimit = 30 * 1024 } = {}) {
  const layers = [];
  const add = (method, path, handlers, prefix) => {
    for (const p of Array.isArray(path) ? path : [path]) layers.push({ method, ...compile(p, prefix), handlers });
  };
  const app = {
    use(path, ...handlers) {
      if (typeof path === "function") {
        handlers.unshift(path);
        path = "/";
      }
      add(null, path === "/" ? "" : path, handlers, true);
    },
  };
  for (const m of ["get", "post", "put", "patch", "delete"])
    app[m] = (path, ...handlers) => add(m.toUpperCase(), path, handlers, false);

  // Equivalente a express.raw(): deja el cuerpo binario en req.body.
  app.raw = ({ type = [], limit = Infinity } = {}) => (req, _res, next) => {
    const contentType = (req.headers["content-type"] || "").split(";")[0].trim();
    if (!type.includes(contentType)) return next();
    if (req.rawBody.byteLength > limit)
      return next(Object.assign(Error("request entity too large"), { type: "entity.too.large", status: 413 }));
    req.body = new Uint8Array(req.rawBody);
    next();
  };

  app.handle = async (request, extra = {}) => {
    const url = new URL(request.url);
    const headers = Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v]));
    const rawBody = ["GET", "HEAD"].includes(request.method) ? new ArrayBuffer(0) : await request.arrayBuffer();
    const req = {
      method: request.method,
      url: url.pathname + url.search,
      path: url.pathname,
      headers,
      query: Object.fromEntries(url.searchParams),
      params: {},
      rawBody,
      body: undefined,
      ip: headers["cf-connecting-ip"],
      ...extra,
    };
    const res = new Response$();
    // Igual que express.json(): solo para application/json, con límite.
    if ((headers["content-type"] || "").includes("application/json") && rawBody.byteLength) {
      if (rawBody.byteLength > jsonLimit) return res.status(413).json({ error: "Solicitud demasiado grande" }).toResponse();
      try {
        req.body = JSON.parse(new TextDecoder().decode(rawBody));
      } catch {
        return res.status(400).json({ error: "JSON inválido" }).toResponse();
      }
    }
    const stack = layers.filter((l) => (!l.method || l.method === req.method || (l.method === "GET" && req.method === "HEAD")) && l.regex.test(url.pathname));
    let error = null;
    for (const layer of stack) {
      const match = layer.regex.exec(url.pathname);
      req.params = Object.fromEntries(layer.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
      for (const fn of layer.handlers) {
        if (res.finished) break;
        const isErrorHandler = fn.length === 4;
        if (Boolean(error) !== isErrorHandler) continue;
        let advanced = false;
        const next = (e) => {
          advanced = true;
          if (e) error = e;
          else if (isErrorHandler) error = null;
        };
        try {
          await (isErrorHandler ? fn(error, req, res, next) : fn(req, res, next));
        } catch (e) {
          error = e;
          advanced = true;
        }
        if (res.finished) return res.toResponse();
        if (!advanced) {
          // El manejador no respondió ni llamó a next(): esperar como Express
          // no tiene sentido aquí; se considera respuesta vacía.
          return res.toResponse();
        }
        if (error && !isErrorHandler) break; // saltar al siguiente manejador de errores
      }
      if (res.finished) return res.toResponse();
    }
    if (error) {
      console.error(error);
      return res
        .status(error.status || 500)
        .json({ error: error.status && error.status < 500 ? error.message : "Error interno del servidor" })
        .toResponse();
    }
    return res.status(404).json({ error: "No encontrado" }).toResponse();
  };
  return app;
}
