export function price(items, products, zone, delivery, payment) {
  if (
    !["pickup", "delivery"].includes(delivery) ||
    !["cash", "mp", "transfer"].includes(payment)
  )
    throw Error("Entrega o pago inválido");
  if (!Array.isArray(items) || !items.length || items.length > 50)
    throw Error("Carrito vacío o demasiado grande");
  const lines = items.map((i) => {
    const p = products.find((p) => p.id === i.id && p.active);
    if (
      !p ||
      !Number.isInteger(i.quantity) ||
      i.quantity < 1 ||
      i.quantity > 30
    )
      throw Error("Producto no disponible o cantidad inválida");
    const selections = i.selections || {};
    if (
      typeof selections !== "object" ||
      Array.isArray(selections) ||
      Object.keys(selections).some(
        (key) => !(p.options || []).some((g) => g.id === key),
      )
    )
      throw Error("Opciones desconocidas");
    const optionLabels = [];
    let extras = 0;
    for (const group of p.options || []) {
      const ids = selections[group.id] || [];
      if (
        !Array.isArray(ids) ||
        new Set(ids).size !== ids.length ||
        ids.length < group.min ||
        ids.length > group.max
      )
        throw Error("Revisa las opciones de " + group.name);
      for (const id of ids) {
        const choice = group.choices.find(
          (c) => c.id === id && c.active !== false,
        );
        if (!choice) throw Error("Opción no disponible");
        extras += choice.price;
        optionLabels.push(group.name + ": " + choice.label);
      }
    }
    return {
      id: p.id,
      name: p.name,
      price: p.price + extras,
      basePrice: p.price,
      selections,
      optionLabels,
      quantity: i.quantity,
      notes: String(i.notes || "").slice(0, 300),
    };
  });
  if (delivery === "delivery" && !zone?.active)
    throw Error("Selecciona una colonia disponible");
  const subtotal = lines.reduce((s, i) => s + i.price * i.quantity, 0),
    shipping = delivery === "delivery" ? zone.fee : 0,
    surcharge = payment === "mp" ? Math.round((subtotal + shipping) * 0.04) : 0;
  return {
    lines,
    subtotal,
    shipping,
    surcharge,
    total: subtotal + shipping + surcharge,
  };
}
export const paymentLabel = (p) =>
  ({ cash: "Efectivo", mp: "Mercado Pago", transfer: "Transferencia" })[p] || p;
// Pago por transferencia disponible solo si el dueño capturó los datos.
export const transferEnabled = (s = {}) =>
  Boolean(s.transferBank?.trim() && s.transferHolder?.trim() && (s.transferClabe || s.transferAccount));
export const transitions = {
  pending: ["cooking", "rejected"],
  cooking: ["ready", "rejected"],
  ready: ["completed"],
  completed: [],
  rejected: [],
};

// Hora aproximada de llegada a domicilio: salida del local (real o estimada)
// más el tiempo de traslado de la colonia guardado en el pedido.
export function arrival(o) {
  const minutes = Number(o?.deliveryMinutes) || 0;
  if (o?.delivery !== "delivery" || minutes <= 0) return null;
  const base =
    o.status === "ready" && o.readyAt
      ? o.readyAt
      : ["pending", "cooking"].includes(o.status) && o.estimatedReadyAt
        ? o.estimatedReadyAt
        : null;
  return {
    minutes,
    at: base ? new Date(new Date(base).getTime() + minutes * 60000).toISOString() : null,
    dispatched: o.status === "ready" && Boolean(o.readyAt),
  };
}
