export function price(items, products, zone, delivery, payment) {
  if (
    !["pickup", "delivery"].includes(delivery) ||
    !["cash", "mp"].includes(payment)
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
    return {
      id: p.id,
      name: p.name,
      price: p.price,
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
export const transitions = {
  pending: ["cooking", "rejected"],
  cooking: ["ready", "rejected"],
  ready: ["completed"],
  completed: [],
  rejected: [],
};
