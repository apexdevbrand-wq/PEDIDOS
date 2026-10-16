const money = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    n / 100,
  );
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function orderMessage(o, settings) {
  const status = {
    pending: "Recibimos tu pedido.",
    cooking: "Tu pedido está en cocina.",
    ready:
      o.delivery === "delivery"
        ? "Tu pedido va en camino."
        : "Tu pedido está listo para recoger.",
    completed: "Tu pedido fue entregado. ¡Gracias!",
    rejected: "Tu pedido fue rechazado.",
  }[o.status];
  const eta =
    o.estimatedReadyAt && !["rejected", "completed"].includes(o.status)
      ? `Hora estimada: ${new Date(o.estimatedReadyAt).toLocaleTimeString("es-MX", { timeZone: settings.timezone, hour: "2-digit", minute: "2-digit" })}.`
      : "";
  return [
    `${settings.businessName} · ${o.folio}`,
    `Hola ${o.name}. ${status}`,
    o.rejectionReason ? `Motivo: ${o.rejectionReason}` : "",
    eta,
    `${o.paymentStatus === "paid" ? "Pagado" : "Total del pedido"}: ${money(o.total)}.`,
    o.status === "rejected" && o.payment === "mp" && o.paymentStatus === "paid"
      ? "Tu pago requiere gestionar un reembolso; nos pondremos en contacto contigo."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
export function whatsapp(o, settings) {
  let phone = String(o.phone).replace(/\D/g, "");
  if (phone.length === 10) phone = settings.countryCode + phone;
  if (!/^\d{11,15}$/.test(phone))
    throw Error("El teléfono necesita código de país válido");
  const message = orderMessage(o, settings);
  return {
    message,
    url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
    phone,
  };
}
export function ticketHtml(o, settings, kind = "customer") {
  const kitchen = kind === "kitchen";
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.folio)}</title><style>@page{size:80mm auto;margin:5mm}body{font:12px monospace;max-width:70mm;margin:12px auto;color:#000}h1{text-align:center;font-size:20px}p{white-space:pre-wrap}li{margin:12px 0;list-style:none}ul{padding:0}hr{border:0;border-top:1px dashed}small{display:block;margin-top:6px}.line{display:flex;justify-content:space-between}@media print{button{display:none}}</style><body><h1>${esc(settings.businessName)}</h1><h2>${kitchen ? "COMANDA" : "COMPROBANTE NO FISCAL"}</h2><p>${esc(o.folio)}\n${esc(new Date(o.createdAt).toLocaleString("es-MX", { timeZone: settings.timezone }))}\n${esc(o.name)} · ${esc(o.phone)}\n${o.delivery === "delivery" ? "ENVÍO · " + esc(o.zone) + "\n" + esc(o.address) : "PARA RECOGER"}</p><hr><ul>${o.lines.map((i) => `<li><b>${i.quantity} × ${esc(i.name)}</b>${!kitchen ? " · " + money(i.price * i.quantity) : ""}${(i.optionLabels || []).map((s) => "<small>" + esc(s) + "</small>").join("")}${i.notes ? "<small>NOTA: " + esc(i.notes) + "</small>" : ""}</li>`).join("")}</ul><hr>${
    !kitchen
      ? [
          ["Productos", o.subtotal],
          ["Envío", o.shipping],
          ["Recargo MP", o.surcharge],
          ["TOTAL", o.total],
        ]
          .map(
            ([label, value]) =>
              `<p class="line"><b>${label}</b><span>${money(value)}</span></p>`,
          )
          .join("")
      : ""
  }<p>${o.payment === "cash" ? "EFECTIVO" : "MERCADO PAGO"} · ${o.paymentStatus === "paid" ? "PAGADO" : o.status === "rejected" ? "RECHAZADO · NO COBRAR" : o.paymentStatus === "refunded" ? "REEMBOLSADO" : "PAGO PENDIENTE"}</p>${o.estimatedReadyAt ? "<p>Estimado: " + esc(new Date(o.estimatedReadyAt).toLocaleTimeString("es-MX", { timeZone: settings.timezone })) + "</p>" : ""}${o.rejectionReason ? "<p>Rechazado: " + esc(o.rejectionReason) + "</p>" : ""}<hr><p>Gracias por tu pedido.</p></body></html>`;
}
