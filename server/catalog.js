// Gestión del catálogo desde el panel: productos, categorías y fotografías.
// Nada se borra de forma definitiva si ya forma parte del historial: los
// productos se archivan (dejan de venderse, pero los pedidos anteriores
// conservan su nombre y precio) y las categorías solo se eliminan vacías.
import { seedCategories } from "./seed.js";
import { uploads, limits } from "./runtime.js";
const randomUUID = () => crypto.randomUUID();
const imagePattern = /^\/(images|uploads)\/[\w.-]{1,120}$/;

const slug = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "categoria";

export function initializeCatalog(state) {
  state.products.forEach((p, i) => {
    p.archived ??= false;
    p.featured ??= false;
    p.sortOrder ??= i;
    p.description ??= "";
    p.image ??= "";
  });
  if (!Array.isArray(state.categories) || !state.categories.length) {
    const names = [...new Set(state.products.map((p) => p.category))];
    const known = seedCategories.map((c) => c.name);
    names.sort(
      (a, b) =>
        (known.includes(a) ? known.indexOf(a) : 99) -
        (known.includes(b) ? known.indexOf(b) : 99),
    );
    const used = new Set();
    state.categories = names.map((name, i) => {
      let id = slug(name);
      while (used.has(id)) id += "-" + i;
      used.add(id);
      return { id, name, sortOrder: i, active: true };
    });
  }
}

const sortedCategories = (state) =>
  [...state.categories].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );

export function sortProducts(state, products) {
  const order = new Map(sortedCategories(state).map((c, i) => [c.name, i]));
  return [...products].sort(
    (a, b) =>
      (order.get(a.category) ?? 999) - (order.get(b.category) ?? 999) ||
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      a.id - b.id,
  );
}

// Visible para clientes: no archivado y con categoría visible.
export function publicCatalog(state, effective) {
  const visible = new Set(
    state.categories.filter((c) => c.active).map((c) => c.name),
  );
  return {
    categories: sortedCategories(state)
      .filter((c) => c.active)
      .map(({ id, name, tagline }) => ({ id, name, tagline: tagline || "" })),
    products: sortProducts(
      state,
      effective.filter((p) => !p.archived && visible.has(p.category)),
    ),
  };
}

// Un producto archivado o en categoría oculta no se puede comprar aunque
// alguien envíe su id directamente a la API.
export function sellable(state, p) {
  const category = state.categories?.find((c) => c.name === p.category);
  return !p.archived && category?.active !== false;
}

export function validateProduct(input, state, { partial = false } = {}) {
  const allowed = [
    "name",
    "category",
    "price",
    "description",
    "image",
    "active",
    "featured",
    "archived",
    "sortOrder",
  ];
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Datos de producto inválidos");
  if (Object.keys(input).some((k) => !allowed.includes(k)))
    throw Error("Campo de producto desconocido");
  const out = {};
  const need = (k) => !partial || input[k] !== undefined;
  if (need("name")) {
    if (
      typeof input.name !== "string" ||
      !input.name.trim() ||
      input.name.trim().length > 80
    )
      throw Error("El nombre debe tener entre 1 y 80 caracteres");
    out.name = input.name.trim();
  }
  if (need("category")) {
    const c = state.categories.find((c) => c.name === input.category);
    if (!c) throw Error("Elige una categoría existente");
    out.category = c.name;
  }
  if (need("price")) {
    if (
      !Number.isInteger(input.price) ||
      input.price < 0 ||
      input.price > 10000000
    )
      throw Error("Precio inválido");
    out.price = input.price;
  }
  if (input.description !== undefined || !partial) {
    const d = input.description ?? "";
    if (typeof d !== "string" || d.length > 300)
      throw Error("La descripción admite hasta 300 caracteres");
    out.description = d.trim();
  }
  if (input.image !== undefined || !partial) {
    const img = input.image ?? "";
    if (typeof img !== "string" || (img && !imagePattern.test(img)))
      throw Error("Fotografía inválida");
    if (img.startsWith("/uploads/") && !uploads.exists(img.slice(9)))
      throw Error("La fotografía ya no existe. Súbela de nuevo.");
    out.image = img;
  }
  for (const k of ["active", "featured", "archived"])
    if (input[k] !== undefined) {
      if (typeof input[k] !== "boolean") throw Error("Valor inválido");
      out[k] = input[k];
    }
  if (input.sortOrder !== undefined) {
    if (
      !Number.isInteger(input.sortOrder) ||
      input.sortOrder < 0 ||
      input.sortOrder > 100000
    )
      throw Error("Orden inválido");
    out.sortOrder = input.sortOrder;
  }
  return out;
}

function validCategoryName(name, state, except) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 40)
    throw Error("El nombre de la categoría debe tener entre 1 y 40 caracteres");
  const clean = name.trim();
  if (
    state.categories.some(
      (c) => c.id !== except && c.name.toLowerCase() === clean.toLowerCase(),
    )
  )
    throw Error("Ya existe una categoría con ese nombre");
  return clean;
}

function sniffImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  const text = (a, b) => String.fromCharCode(...buf.subarray(a, b));
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => buf[i] === v)) return "png";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "webp";
  return null;
}


export function registerCatalog(app, state, { ownerAccess, publish, effective, raw }) {
  const audit = (req, action, target, details) => ({
    actor: req.actor,
    action,
    target: String(target),
    details,
  });
  const fail = (res, e) => res.status(400).json({ error: e.message });

  // Fotografías subidas desde el panel. Nombres aleatorios: caché permanente.
  app.get("/uploads/:name", (req, res) => {
    const file = uploads.get(req.params.name);
    if (!file) return res.sendStatus(404);
    res.set({
      "Content-Type": file.type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
    res.send(file.body);
  });

  app.get("/api/staff/catalog", ownerAccess, (_, res) =>
    res.json({
      categories: sortedCategories(state),
      products: sortProducts(state, effective()),
    }),
  );

  app.post("/api/staff/products", ownerAccess, (req, res) => {
    try {
      const data = validateProduct(req.body, state);
      const id = Math.max(0, ...state.products.map((p) => p.id)) + 1;
      const inCategory = state.products.filter((p) => p.category === data.category);
      const product = {
        id,
        active: true,
        featured: false,
        archived: false,
        sortOrder: Math.max(-1, ...inCategory.map((p) => p.sortOrder ?? 0)) + 1,
        options: [],
        ingredientIds: [],
        ...data,
      };
      state.products.push(product);
      try {
        publish(audit(req, "product.created", id, { name: product.name, price: product.price }));
      } catch (e) {
        state.products.pop();
        throw e;
      }
      res.status(201).json(product);
    } catch (e) {
      fail(res, e);
    }
  });

  app.patch("/api/staff/products/:id", ownerAccess, (req, res) => {
    const p = state.products.find((p) => p.id === Number(req.params.id));
    if (!p) return res.sendStatus(404);
    try {
      const data = validateProduct(req.body, state, { partial: true });
      if (!Object.keys(data).length) throw Error("No hay cambios");
      const before = { price: p.price, active: p.active, archived: p.archived };
      Object.assign(p, data);
      const action =
        data.archived === true && !before.archived
          ? "product.archived"
          : data.archived === false && before.archived
            ? "product.restored"
            : "product.updated";
      publish(
        audit(req, action, p.id, {
          fields: Object.keys(data),
          ...(data.price !== undefined && data.price !== before.price
            ? { price: p.price, previousPrice: before.price }
            : {}),
          ...(data.active !== undefined ? { active: p.active } : {}),
        }),
      );
      res.json(p);
    } catch (e) {
      fail(res, e);
    }
  });

  // Reordena productos dentro de una categoría: { ids: [3, 1, 2] }
  app.put("/api/staff/products-order", ownerAccess, (req, res) => {
    const ids = req.body?.ids;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 500 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !state.products.some((p) => p.id === id))
    )
      return res.status(400).json({ error: "Orden inválido" });
    ids.forEach((id, i) => {
      state.products.find((p) => p.id === id).sortOrder = i;
    });
    publish(audit(req, "product.reordered", "catalog", { count: ids.length }));
    res.json({ ok: true });
  });

  app.post("/api/staff/categories", ownerAccess, (req, res) => {
    try {
      const name = validCategoryName(req.body?.name, state);
      let id = slug(name);
      while (state.categories.some((c) => c.id === id))
        id = slug(name) + "-" + randomUUID().slice(0, 4);
      const category = {
        id,
        name,
        active: true,
        sortOrder: Math.max(-1, ...state.categories.map((c) => c.sortOrder)) + 1,
      };
      state.categories.push(category);
      publish(audit(req, "category.created", id, { name }));
      res.status(201).json(category);
    } catch (e) {
      fail(res, e);
    }
  });

  app.patch("/api/staff/categories/:id", ownerAccess, (req, res) => {
    const c = state.categories.find((c) => c.id === req.params.id);
    if (!c) return res.sendStatus(404);
    try {
      const b = req.body || {};
      if (Object.keys(b).some((k) => !["name", "active", "tagline"].includes(k)))
        throw Error("Campo desconocido");
      if (b.tagline !== undefined && (typeof b.tagline !== "string" || b.tagline.length > 60))
        throw Error("La frase de la categoría admite hasta 60 caracteres");
      if (b.active !== undefined && typeof b.active !== "boolean")
        throw Error("Valor inválido");
      const name = b.name !== undefined ? validCategoryName(b.name, state, c.id) : c.name;
      const previous = c.name;
      if (name !== previous)
        for (const p of state.products) if (p.category === previous) p.category = name;
      c.name = name;
      if (b.active !== undefined) c.active = b.active;
      if (b.tagline !== undefined) c.tagline = b.tagline.trim();
      publish(audit(req, "category.updated", c.id, { name, previous, active: c.active }));
      res.json(c);
    } catch (e) {
      fail(res, e);
    }
  });

  app.put("/api/staff/categories-order", ownerAccess, (req, res) => {
    const ids = req.body?.ids;
    if (
      !Array.isArray(ids) ||
      ids.length !== state.categories.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !state.categories.some((c) => c.id === id))
    )
      return res.status(400).json({ error: "Orden de categorías inválido" });
    ids.forEach((id, i) => {
      state.categories.find((c) => c.id === id).sortOrder = i;
    });
    publish(audit(req, "category.reordered", "catalog"));
    res.json(sortedCategories(state));
  });

  app.delete("/api/staff/categories/:id", ownerAccess, (req, res) => {
    const index = state.categories.findIndex((c) => c.id === req.params.id);
    if (index < 0) return res.sendStatus(404);
    const c = state.categories[index];
    const count = state.products.filter((p) => p.category === c.name).length;
    if (count)
      return res.status(409).json({
        error: `La categoría tiene ${count} producto(s), incluidos archivados. Muévelos a otra categoría u ocúltala.`,
      });
    state.categories.splice(index, 1);
    try {
      publish(audit(req, "category.deleted", c.id, { name: c.name }));
    } catch (e) {
      state.categories.splice(index, 0, c);
      throw e;
    }
    res.json({ ok: true });
  });

  app.post(
    "/api/staff/uploads",
    ownerAccess,
    raw({
      type: ["image/jpeg", "image/png", "image/webp"],
      limit: limits.maxUpload,
    }),
    (req, res) => {
      const body = req.body instanceof Uint8Array ? req.body : null;
      if (!body?.length)
        return res.status(400).json({
          error: `Sube una imagen JPG, PNG o WebP de hasta ${limits.maxUpload / 1048576} MB.`,
        });
      const ext = sniffImage(body);
      if (!ext)
        return res.status(400).json({ error: "El archivo no es una imagen JPG, PNG o WebP válida." });
      const name = randomUUID() + "." + ext;
      uploads.put(name, body, { jpg: "image/jpeg", png: "image/png", webp: "image/webp" }[ext]);
      publish(audit(req, "photo.uploaded", name, { bytes: body.length }));
      res.status(201).json({ url: "/uploads/" + name, bytes: body.length });
    },
  );
  // Errores de tamaño/tipo del cuerpo binario en español.
  app.use("/api/staff/uploads", (err, _req, res, next) => {
    if (err?.type === "entity.too.large")
      return res
        .status(413)
        .json({ error: `La foto pesa más de ${limits.maxUpload / 1048576} MB. Usa una más ligera.` });
    next(err);
  });
}
