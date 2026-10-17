import { createHash } from "node:crypto";
import { seedIngredients } from "./seed.js";
import { sellable } from "./catalog.js";
export const defaultSettings = {
  businessName: "Los Santos",
  timezone: "America/Mexico_City",
  countryCode: "52",
  manualClosed: false,
  pausedUntil: null,
  pauseReason: "Estamos preparando muchos antojos. Vuelve en unos minutos.",
  defaultPrepMinutes: 25,
  // Datos públicos que se muestran en el catálogo.
  tagline: "El sabor que te mereces.",
  address: "Constitución 82, Insurgentes Norte, Minatitlán, Ver.",
  publicPhone: "",
  instagram: "lossantos__mina",
  tiktok: "los_santos1drinks",
  facebook: "https://www.facebook.com/profile.php?id=61582954447251",
  // Transferencia bancaria (se muestra al cliente) y WhatsApp para comprobantes.
  transferBank: "",
  transferHolder: "",
  transferClabe: "",
  transferAccount: "",
  receiptWhatsapp: "9214899319",
  scheduleEnabled: false,
  hours: Array.from({ length: 7 }, () => ({
    enabled: true,
    open: "12:00",
    close: "23:00",
  })),
};
// Instalaciones de la primera versión: sus seis productos de demostración no
// guardaban relaciones de insumos. Solo se completan si siguen sin definirse.
const legacyDemo = {
  "Burger Santa": ["res", "pan"],
  "Papas de la casa": ["papas"],
  "Alitas BBQ": ["pollo"],
  "Boneless Buffalo": ["pollo"],
  "Limonada mineral": ["limon"],
  "Pizza pepperoni": ["masa", "queso"],
};
export function initializeOperations(state) {
  state.settings = { ...defaultSettings, ...state.settings };
  state.ingredients ??= structuredClone(seedIngredients);
  for (const id of new Set(Object.values(legacyDemo).flat()))
    if (
      state.products.some((p) => p.ingredientIds === undefined && legacyDemo[p.name]?.includes(id)) &&
      !state.ingredients.some((i) => i.id === id)
    )
      state.ingredients.push({ id, name: id === "masa" ? "Masa" : id, available: true });
  state.closures ??= [];
  for (const p of state.products) {
    if (p.ingredientIds === undefined) p.ingredientIds = legacyDemo[p.name] || [];
    p.options ??= [];
  }
}
export function effectiveProducts(state) {
  const missing = (ids) =>
    (ids || [])
      .map((id) => state.ingredients.find((i) => i.id === id))
      .filter((i) => !i?.available);
  return state.products.map((p) => {
    const unavailable = missing(p.ingredientIds);
    const options = (p.options || []).map((g) => ({
      ...g,
      choices: g.choices.map((c) => ({
        ...c,
        enabled: c.active !== false,
        active: c.active !== false && !missing(c.ingredientIds).length,
      })),
    }));
    const missingChoice = options.some(
      (g) => g.choices.filter((c) => c.active).length < g.min,
    );
    return {
      ...p,
      enabled: p.active,
      active:
        p.active && sellable(state, p) && !unavailable.length && !missingChoice,
      unavailableReason: !sellable(state, p)
        ? "Archivado u oculto"
        : unavailable.length
        ? "Insumo agotado: " +
          unavailable.map((i) => i?.name || "desconocido").join(", ")
        : missingChoice
          ? "Se agotó una opción obligatoria"
          : "",
      options,
    };
  });
}
export function opening(settings, now = new Date()) {
  if (settings.manualClosed)
    return {
      open: false,
      reason: "Por el momento no estamos recibiendo pedidos.",
    };
  if (settings.pausedUntil && new Date(settings.pausedUntil) > now)
    return {
      open: false,
      reason: settings.pauseReason,
      until: settings.pausedUntil,
    };
  if (!settings.scheduleEnabled) return { open: true, reason: "" };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: settings.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const val = (t) => parts.find((p) => p.type === t)?.value;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      val("weekday"),
    ),
    minutes = Number(val("hour")) * 60 + Number(val("minute"));
  const min = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const current = settings.hours[day],
    previous = settings.hours[(day + 6) % 7];
  const valid =
    (current.enabled &&
      (min(current.open) < min(current.close)
        ? minutes >= min(current.open) && minutes < min(current.close)
        : minutes >= min(current.open))) ||
    (previous.enabled &&
      min(previous.open) > min(previous.close) &&
      minutes < min(previous.close));
  return {
    open: Boolean(valid),
    reason: valid ? "" : "Estamos fuera de nuestro horario de pedidos.",
  };
}
export function validateSettings(input) {
  const allowed = [
    "businessName",
    "timezone",
    "countryCode",
    "manualClosed",
    "pausedUntil",
    "pauseReason",
    "defaultPrepMinutes",
    "scheduleEnabled",
    "hours",
    "tagline",
    "address",
    "publicPhone",
    "instagram",
    "tiktok",
    "facebook",
    "transferBank",
    "transferHolder",
    "transferClabe",
    "transferAccount",
    "receiptWhatsapp",
  ];
  if (Object.keys(input).some((k) => !allowed.includes(k)))
    throw Error("Configuración desconocida");
  if (
    input.businessName !== undefined &&
    (typeof input.businessName !== "string" ||
      !input.businessName.trim() ||
      input.businessName.length > 80)
  )
    throw Error("Nombre de negocio inválido");
  for (const k of ["manualClosed", "scheduleEnabled"])
    if (input[k] !== undefined && typeof input[k] !== "boolean")
      throw Error("Valor inválido");
  if (
    input.defaultPrepMinutes !== undefined &&
    (!Number.isInteger(input.defaultPrepMinutes) ||
      input.defaultPrepMinutes < 1 ||
      input.defaultPrepMinutes > 240)
  )
    throw Error("Tiempo de preparación: 1 a 240 minutos");
  for (const k of ["tagline", "address"])
    if (
      input[k] !== undefined &&
      (typeof input[k] !== "string" || input[k].length > 160)
    )
      throw Error("Texto público demasiado largo (máximo 160)");
  if (
    input.publicPhone !== undefined &&
    !/^(\d{10,15})?$/.test(input.publicPhone)
  )
    throw Error("Teléfono público: solo dígitos, 10 a 15");
  for (const k of ["instagram", "tiktok"])
    if (input[k] !== undefined && !/^[\w.]{0,40}$/.test(input[k]))
      throw Error("Usuario de red social inválido (sin @ ni enlaces)");
  if (
    input.facebook !== undefined &&
    !/^(https:\/\/(www\.|m\.)?facebook\.com\/[\w.?=&/-]{1,200})?$/.test(
      input.facebook,
    )
  )
    throw Error("El enlace de Facebook debe empezar con https://facebook.com/");
  for (const k of ["transferBank", "transferHolder"])
    if (input[k] !== undefined && (typeof input[k] !== "string" || input[k].length > 80))
      throw Error("Banco y titular: máximo 80 caracteres");
  if (input.transferClabe !== undefined && !/^(\d{18})?$/.test(input.transferClabe))
    throw Error("La CLABE debe tener 18 dígitos");
  if (input.transferAccount !== undefined && !/^(\d{10,19})?$/.test(input.transferAccount))
    throw Error("Cuenta o tarjeta: solo dígitos (10 a 19)");
  if (input.receiptWhatsapp !== undefined && !/^(\d{10,15})?$/.test(input.receiptWhatsapp))
    throw Error("WhatsApp para comprobantes: 10 a 15 dígitos");
  if (input.countryCode !== undefined && !/^\d{1,3}$/.test(input.countryCode))
    throw Error("Código de país inválido");
  if (input.timezone !== undefined) {
    try {
      new Intl.DateTimeFormat("es", { timeZone: input.timezone });
    } catch {
      throw Error("Zona horaria inválida");
    }
  }
  if (
    input.pausedUntil !== undefined &&
    input.pausedUntil !== null &&
    !Number.isFinite(Date.parse(input.pausedUntil))
  )
    throw Error("Fecha de pausa inválida");
  if (
    input.pauseReason !== undefined &&
    (typeof input.pauseReason !== "string" || input.pauseReason.length > 300)
  )
    throw Error("Mensaje demasiado largo");
  if (
    input.hours !== undefined &&
    (!Array.isArray(input.hours) ||
      input.hours.length !== 7 ||
      input.hours.some(
        (h) =>
          typeof h.enabled !== "boolean" ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(h.open) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(h.close) ||
          h.open === h.close,
      ))
  )
    throw Error("Revisa el horario de los siete días");
  return input;
}
export function validateOptions(groups, ingredients) {
  if (!Array.isArray(groups) || groups.length > 8)
    throw Error("Máximo ocho grupos de opciones");
  const seen = new Set();
  for (const g of groups) {
    if (
      typeof g.id !== "string" ||
      !/^[\w-]{1,60}$/.test(g.id) ||
      seen.has(g.id) ||
      !g.name?.trim() ||
      g.name.length > 80 ||
      !Array.isArray(g.choices) ||
      !g.choices.length ||
      g.choices.length > 20 ||
      !Number.isInteger(g.min) ||
      !Number.isInteger(g.max) ||
      g.min < 0 ||
      g.max < g.min ||
      g.max > g.choices.length
    )
      throw Error("Grupo de opciones inválido");
    seen.add(g.id);
    const ids = new Set();
    for (const c of g.choices) {
      if (
        typeof c.id !== "string" ||
        !/^[\w-]{1,60}$/.test(c.id) ||
        ids.has(c.id) ||
        !c.label?.trim() ||
        c.label.length > 80 ||
        !Number.isInteger(c.price) ||
        c.price < 0 ||
        c.price > 1000000 ||
        typeof c.active !== "boolean" ||
        !Array.isArray(c.ingredientIds || []) ||
        (c.ingredientIds || []).some(
          (id) => !ingredients.some((i) => i.id === id),
        )
      )
        throw Error("Opción o precio inválido");
      ids.add(c.id);
    }
  }
  return groups;
}
export function payloadHash(b) {
  const normalized = {
    name: String(b.name || "").trim(),
    phone: String(b.phone || ""),
    delivery: b.delivery,
    zoneId: b.delivery === "delivery" ? Number(b.zoneId) : null,
    address: b.delivery === "delivery" ? b.address : "",
    payment: b.payment,
    items: Array.isArray(b.items)
      ? b.items.map((i) => ({
          id: i.id,
          quantity: i.quantity,
          notes: i.notes || "",
          selections: Object.fromEntries(
            Object.entries(i.selections || {})
              .sort()
              .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v]),
          ),
        }))
      : b.items,
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
export function financialReport(
  orders,
  { date, from, to, timezone = "America/Mexico_City" } = {},
) {
  const inRange = (value) => {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return false;
    if (date && d.toLocaleDateString("en-CA", { timeZone: timezone }) !== date)
      return false;
    return (!from || d > new Date(from)) && (!to || d <= new Date(to));
  };
  const paid = orders.filter(
    (o) =>
      ["paid", "refunded", "charged_back"].includes(o.paymentStatus) &&
      inRange(o.paidAt || o.createdAt),
  );
  const refunds = orders.flatMap((o) =>
    (o.refundEvents || [])
      .filter((e) => inRange(e.at))
      .map((e) => ({
        folio: o.folio,
        at: e.at,
        amount: e.amount,
        payment: o.payment,
      })),
  );
  const refundedTotal = refunds.reduce((s, e) => s + e.amount, 0);
  const sum = (list, key) => list.reduce((s, o) => s + o[key], 0);
  return {
    date: date || null,
    from: from || null,
    to: to || new Date().toISOString(),
    grossCollected: sum(paid, "total"),
    refunds,
    refundedTotal,
    netCollected: sum(paid, "total") - refundedTotal,
    cashCollected: sum(
      paid.filter((o) => o.payment === "cash"),
      "total",
    ),
    transferCollected: sum(
      paid.filter((o) => o.payment === "transfer"),
      "total",
    ),
    mpCollected: sum(
      paid.filter((o) => o.payment === "mp"),
      "total",
    ),
    productRevenue: sum(paid, "subtotal"),
    shippingCollected: sum(paid, "shipping"),
    surchargeCollected: sum(paid, "surcharge"),
    refundRequired: paid
      .filter((o) => o.status === "rejected")
      .reduce(
        (s, o) =>
          s +
          Math.max(
            0,
            o.total - (o.refundEvents || []).reduce((v, e) => v + e.amount, 0),
          ),
        0,
      ),
    paidCount: paid.length,
    rejectedCount: orders.filter(
      (o) => o.status === "rejected" && inRange(o.rejectedAt || o.createdAt),
    ).length,
    pendingTotal: sum(
      orders.filter(
        (o) =>
          o.paymentStatus === "unpaid" &&
          o.status !== "rejected" &&
          inRange(o.createdAt),
      ),
      "total",
    ),
    orders: paid.map((o) => ({
      folio: o.folio,
      paidAt: o.paidAt || o.createdAt,
      payment: o.payment,
      status: o.status,
      subtotal: o.subtotal,
      shipping: o.shipping,
      surcharge: o.surcharge,
      total: o.total,
    })),
  };
}
