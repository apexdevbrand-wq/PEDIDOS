import React, { useState } from "react";
import { Flame } from "lucide-react";
import { money, labels } from "../api";
export default function Kitchen({ orders, update, connected }) {
  const [filter, setFilter] = useState("active");
  const visible = orders.filter(
    (o) => filter === "all" || !["completed", "rejected"].includes(o.status),
  );
  return (
    <main className="workspace">
      <div className="section-title">
        <div>
          <span className="eyebrow">EL CORAZÓN DE LOS SANTOS</span>
          <h1>
            Cocina en vivo<span className="dot">.</span>
          </h1>
          <p className="muted">Primero, los pedidos más antiguos.</p>
        </div>
        <span className="live">
          {connected ? "● Conectado en tiempo real" : "○ Reconectando…"}
        </span>
      </div>
      <div className="categories">
        {[
          ["active", "En curso"],
          ["all", "Todos"],
        ].map(([v, n]) => (
          <button
            className={filter === v ? "active" : ""}
            onClick={() => setFilter(v)}
            key={v}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="order-grid">
        {visible.map((o) => (
          <article className={"order status-" + o.status} key={o.id}>
            <div className="line">
              <b>{o.folio}</b>
              <span className="badge">{labels[o.status]}</span>
            </div>
            <small>{new Date(o.createdAt).toLocaleString("es-MX")}</small>
            <h3>
              {o.delivery === "delivery"
                ? "🚀 Envío · " + o.zone
                : "🛍️ Para recoger"}
            </h3>
            <p>
              {o.name} · {o.phone}
            </p>
            {o.address && <p>{o.address}</p>}
            <ul>
              {o.lines.map((i, n) => (
                <li key={n}>
                  <b>
                    {i.quantity} × {i.name}
                  </b>
                  {i.notes && <p className="notice">Nota: {i.notes}</p>}
                </li>
              ))}
            </ul>
            <div className="totals">
              <div>
                <span>
                  {o.payment === "cash" ? "Efectivo" : "Mercado Pago"}
                </span>
                <b>{o.paymentStatus === "paid" ? "Cobrado" : "Por cobrar"}</b>
              </div>
              {[
                ["Productos", o.subtotal],
                ["Envío", o.shipping],
                ["Tarifa MP", o.surcharge],
                ["Total", o.total],
              ].map(([n, v]) => (
                <div key={n}>
                  <span>{n}</span>
                  <b>{money(v)}</b>
                </div>
              ))}
            </div>
            <div className="order-actions">
              {o.payment === "mp" && o.paymentStatus !== "paid" && (
                <p className="notice">
                  Pago digital pendiente de confirmación. No preparar todavía.
                </p>
              )}
              {o.status === "pending" &&
                (o.payment === "cash" || o.paymentStatus === "paid") && (
                  <button
                    className="primary"
                    onClick={() =>
                      update("/staff/orders/" + o.id, { status: "cooking" })
                    }
                  >
                    Aceptar y preparar
                  </button>
                )}
              {o.status === "cooking" && (
                <button
                  className="primary"
                  onClick={() =>
                    update("/staff/orders/" + o.id, { status: "ready" })
                  }
                >
                  {o.delivery === "delivery"
                    ? "Listo / En camino"
                    : "Listo para recoger"}
                </button>
              )}
              {o.status === "ready" && (
                <button
                  className="primary"
                  onClick={() =>
                    update("/staff/orders/" + o.id, { status: "completed" })
                  }
                >
                  Confirmar entrega y cobro
                </button>
              )}
              {["pending", "cooking"].includes(o.status) && (
                <button
                  className="reject"
                  onClick={() => {
                    if (
                      confirm(
                        o.payment === "mp" && o.paymentStatus === "paid"
                          ? "Pedido pagado: debes tramitar un reembolso o acordar un cupón con el cliente. ¿Rechazar?"
                          : "¿Rechazar este pedido?",
                      )
                    )
                      update("/staff/orders/" + o.id, { status: "rejected" });
                  }}
                >
                  Rechazar pedido
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className="empty big">
          <Flame size={40} />
          <h2>Todo al día en cocina</h2>
          <p>Los nuevos pedidos aparecerán aquí.</p>
        </div>
      )}
    </main>
  );
}
