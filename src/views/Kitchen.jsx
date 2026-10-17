import React, { useState, useEffect } from "react";
import { Flame } from "lucide-react";
import { api, money, labels } from "../api";
import Modal from "../components/Modal";
import { printHtml } from "../components/Tracking";
import useKitchenSound from "../hooks/useKitchenSound";
export default function Kitchen({
  orders,
  update,
  connected,
  catalog,
  run,
  refresh,
}) {
  const [filter, setFilter] = useState("active"),
    [now, setNow] = useState(Date.now()),
    [action, setAction] = useState(null),
    [minutes, setMinutes] = useState(25),
    [reason, setReason] = useState(""),
    [message, setMessage] = useState(""),
    [phone, setPhone] = useState(""),
    [busy, setBusy] = useState(false);
  const sound = useKitchenSound(orders);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const visible = orders.filter(
    (o) => filter === "all" || !["completed", "rejected"].includes(o.status),
  );
  async function acceptAction(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const result = await update(
      "/staff/orders/" + action.order.id,
      action.type === "reject"
        ? { status: "rejected", rejectionReason: reason }
        : {
            ...(action.type === "accept" ? { status: "cooking" } : {}),
            prepMinutes: Number(minutes),
          },
    );
    if (result) setAction(null);
    setBusy(false);
  }
  async function openWhatsApp(o) {
    await run(async () => {
      const w = await api("/staff/orders/" + o.id + "/whatsapp");
      setMessage(w.message);
      setPhone(w.phone);
      setAction({ type: "whatsapp", order: o });
    });
  }
  async function print(o, kind) {
    const popup = window.open("", "_blank", "width=420,height=720");
    if (!popup)
      return run(() => {
        throw Error("Permite ventanas emergentes para imprimir.");
      });
    try {
      const t = await api("/staff/orders/" + o.id + "/ticket?kind=" + kind);
      popup.document.write(t.html);
      popup.document.close();
      popup.focus();
      popup.print();
    } catch (e) {
      popup.close();
      await run(() => {
        throw e;
      });
    }
  }
  return (
    <main className="workspace">
      <div className="section-title">
        <div>
          <span className="eyebrow">EL CORAZÓN DE LOS SANTOS</span>
          <h1>
            Cocina en vivo<span className="dot">.</span>
          </h1>
          <p className="muted">
            Primero los pedidos más antiguos ·{" "}
            {orders.filter((o) => o.status === "pending").length} por aceptar
          </p>
        </div>
        <span className="live">
          {connected ? "● Conectado en tiempo real" : "○ Reconectando…"}
        </span>
      </div>
      <div className="kitchen-toolbar">
        <button
          className={"secondary " + (sound.enabled ? "enabled" : "")}
          onClick={sound.toggle}
        >
          {sound.enabled ? "🔊 Desactivar sonido" : "🔈 Activar sonido"}
        </button>
        {sound.ringing && (
          <button className="primary" onClick={sound.silence}>
            🔕 Silenciar alarma
          </button>
        )}
        <button
          className="secondary"
          onClick={() =>
            run(async () => {
              await api("/staff/pause", "POST", {
                minutes: catalog.availability?.until ? 0 : 20,
              });
              await refresh();
            })
          }
        >
          {catalog.availability?.until
            ? "Reanudar pedidos"
            : "Pausar pedidos 20 min"}
        </button>
        {sound.message && (
          <span className="muted" role="status">
            {sound.message}
          </span>
        )}
      </div>
      {catalog.availability && !catalog.availability.open && (
        <p className="notice">
          {catalog.availability.reason}
          {catalog.availability.until
            ? " Hasta " +
              new Date(catalog.availability.until).toLocaleTimeString("es-MX", {
                timeZone: catalog.settings?.timezone || "America/Mexico_City",
                hour: "2-digit",
                minute: "2-digit",
              })
            : ""}
        </p>
      )}
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
            <small>
              {new Date(o.createdAt).toLocaleString("es-MX", {
                timeZone: catalog.settings?.timezone || "America/Mexico_City",
              })}
            </small>
            <p
              className={
                o.estimatedReadyAt &&
                now > new Date(o.estimatedReadyAt) &&
                !["completed", "rejected"].includes(o.status)
                  ? "elapsed overdue"
                  : "elapsed"
              }
            >
              {Math.max(0, Math.floor((now - new Date(o.createdAt)) / 60000))}{" "}
              min desde el pedido
              {o.estimatedReadyAt && (
                <>
                  {" "}
                  · Estimado{" "}
                  {new Date(o.estimatedReadyAt).toLocaleTimeString("es-MX", {
                    timeZone:
                      catalog.settings?.timezone || "America/Mexico_City",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </>
              )}
            </p>
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
                  {(i.optionLabels || []).map((label) => (
                    <small key={label}>{label}</small>
                  ))}
                  {i.notes && <p className="notice">Nota: {i.notes}</p>}
                </li>
              ))}
            </ul>
            {o.rejectionReason && (
              <p className="notice">
                <b>Rechazo:</b> {o.rejectionReason}
              </p>
            )}
            <div className="totals">
              <div>
                <span>
                  {o.payment === "cash" ? "Efectivo" : "Mercado Pago"}
                </span>
                <b>
                  {o.paymentStatus === "paid"
                    ? "Cobrado"
                    : o.paymentStatus === "refunded"
                      ? "Reembolsado"
                      : o.status === "rejected"
                        ? "No cobrado"
                        : "Pago pendiente"}
                </b>
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
              {o.payment === "mp" && o.paymentStatus === "unpaid" && (
                <p className="notice">
                  Pago digital pendiente. No preparar todavía.
                </p>
              )}
              {o.refundRequired && (
                <p className="notice">
                  Reembolso pendiente: debes tramitarlo con el cliente. No se
                  devuelve automáticamente.
                </p>
              )}
              {o.status === "pending" &&
                (o.payment === "cash" || o.paymentStatus === "paid") && (
                  <button
                    className="primary"
                    onClick={() => {
                      setMinutes(catalog.settings?.defaultPrepMinutes || 25);
                      setAction({ type: "accept", order: o });
                    }}
                  >
                    Aceptar y preparar
                  </button>
                )}
              {o.status === "cooking" && (
                <>
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
                  <button
                    className="secondary"
                    onClick={() => {
                      setMinutes(15);
                      setAction({ type: "eta", order: o });
                    }}
                  >
                    Actualizar tiempo
                  </button>
                </>
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
                    setReason("");
                    setAction({ type: "reject", order: o });
                  }}
                >
                  Rechazar pedido
                </button>
              )}
              <div className="ticket-actions">
                <button
                  className="whatsapp-button"
                  onClick={() => openWhatsApp(o)}
                >
                  WhatsApp
                </button>
                <button onClick={() => print(o, "kitchen")}>Comanda</button>
                <button onClick={() => print(o, "customer")}>Ticket</button>
              </div>
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
      {action && (
        <Modal
          title={
            action.type === "whatsapp"
              ? "Mensaje de WhatsApp"
              : action.type === "reject"
                ? "Rechazar " + action.order.folio
                : action.type === "eta"
                  ? "Actualizar tiempo estimado"
                  : "Aceptar y preparar"
          }
          onClose={() => setAction(null)}
        >
          {action.type === "whatsapp" ? (
            <>
              <p className="muted">
                Revisa el texto. Abriremos WhatsApp; tú decides cuándo pulsar
                Enviar. No se envía ningún mensaje automáticamente.
              </p>
              <label>
                Mensaje preparado
                <textarea
                  rows={9}
                  value={message}
                  maxLength={2000}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </label>
              <a
                className="primary full whatsapp-button"
                href={
                  "https://wa.me/" +
                  phone +
                  "?text=" +
                  encodeURIComponent(message)
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir WhatsApp
              </a>
            </>
          ) : (
            <form onSubmit={acceptAction}>
              {action.type === "reject" ? (
                <>
                  <label>
                    Motivo de rechazo
                    <textarea
                      required
                      minLength={3}
                      maxLength={300}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Ejemplo: se agotó el pollo"
                    />
                  </label>
                  <p className="muted">
                    El cliente verá este motivo en su seguimiento y, si lo
                    autorizó, en un aviso push.
                  </p>
                  {action.order.payment === "mp" &&
                    action.order.paymentStatus === "paid" && (
                      <p className="notice">
                        Este pedido está pagado. Debes gestionar el reembolso o
                        acordar un cupón con el cliente.
                      </p>
                    )}
                </>
              ) : (
                <label>
                  Minutos estimados desde ahora
                  <input
                    required
                    type="number"
                    min="1"
                    max="240"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                </label>
              )}
              <button className="primary full" disabled={busy}>
                {busy
                  ? "Guardando…"
                  : action.type === "reject"
                    ? "Confirmar rechazo"
                    : "Confirmar tiempo y avisar"}
              </button>
            </form>
          )}
        </Modal>
      )}
    </main>
  );
}
