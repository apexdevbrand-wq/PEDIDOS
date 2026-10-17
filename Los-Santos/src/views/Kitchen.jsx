import React, { useState, useEffect } from "react";
import { api, money, labels } from "../api";
import { arrival, paymentLabel } from "../../server/domain.js";
import Modal from "../components/Modal";
import Mascot from "../components/Mascot";
import { printHtml } from "../components/Tracking";
import useKitchenSound, { isNativeApp } from "../hooks/useKitchenSound";
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
  const visible = orders;
  async function confirmTransfer(o) {
    await run(async () => {
      await api("/staff/orders/" + o.id + "/confirm-transfer", "POST", {});
      await refresh();
    });
  }
  async function checkPayment(o) {
    await run(async () => {
      const r = await api("/staff/orders/" + o.id + "/payment-check", "POST", {});
      await refresh();
      if (r.status !== "approved")
        throw Error("Mercado Pago aún no reporta este pago como aprobado (" + (r.status || "sin pago") + ").");
    });
  }
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
  const tz = catalog.settings?.timezone || "America/Mexico_City";
  const time = (d) =>
    new Date(d).toLocaleTimeString("es-MX", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
    });
  const columns =
    filter === "active"
      ? [
          ["pending", "Nuevos"],
          ["cooking", "En cocina"],
          ["ready", "Listos / en camino"],
        ]
      : [
          ["completed", "Entregados"],
          ["rejected", "Rechazados"],
        ];
  const card = (o) => {
    const waited = Math.max(0, Math.floor((now - new Date(o.createdAt)) / 60000));
    const overdue =
      o.estimatedReadyAt &&
      now > new Date(o.estimatedReadyAt) &&
      !["completed", "rejected"].includes(o.status);
    return (
      <article className={"order status-" + o.status + (overdue ? " is-overdue" : "")} key={o.id}>
        <header className="order-head">
          <div>
            <b className="order-folio">{o.folio}</b>
            <span className="order-type">
              {o.delivery === "delivery" ? "Domicilio · " + o.zone : "Para recoger"}
            </span>
          </div>
          <div className={"order-clock" + (overdue ? " overdue" : "")}>
            <b>{waited}′</b>
            <small>
              {o.estimatedReadyAt && !["completed", "rejected"].includes(o.status)
                ? (overdue ? "vencido " : "listo ") + time(o.estimatedReadyAt)
                : time(o.createdAt)}
            </small>
          </div>
        </header>
        <ul className="order-lines">
          {o.lines.map((i, n) => (
            <li key={n}>
              <span className="qty">{i.quantity}</span>
              <div>
                <b>{i.name}</b>
                {(i.optionLabels || []).map((label) => (
                  <small key={label}>{label}</small>
                ))}
                {i.notes && <p className="line-note">{i.notes}</p>}
              </div>
            </li>
          ))}
        </ul>
        {(() => {
          const trip = arrival(o);
          if (!trip) return null;
          const late = trip.dispatched && trip.at && now > new Date(trip.at);
          return (
            <p className={"order-eta" + (late ? " is-late" : "")}>
              {trip.dispatched && trip.at
                ? `${late ? "Debió llegar" : "Llega aprox."} ${time(trip.at)} · ${trip.minutes} min a ${o.zone}`
                : `Traslado a ${o.zone}: ~${trip.minutes} min después de salir`}
            </p>
          );
        })()}
        <div className="order-customer">
          <b>{o.name}</b> · <a href={"tel:" + o.phone}>{o.phone}</a>
          {o.address && <p>{o.address}</p>}
        </div>
        {o.rejectionReason && (
          <p className="notice">
            <b>Rechazo:</b> {o.rejectionReason}
          </p>
        )}
        <div className="order-pay">
          <span className={"pay-tag " + o.payment + " " + o.paymentStatus}>
            {paymentLabel(o.payment)} ·{" "}
            {o.paymentStatus === "paid"
              ? "cobrado"
              : o.paymentStatus === "refunded"
                ? "reembolsado"
                : o.status === "rejected"
                  ? "no cobrado"
                  : "por cobrar"}
          </span>
          <b>{money(o.total)}</b>
        </div>
        <details className="order-breakdown">
          <summary>Desglose</summary>
          {[
            ["Productos", o.subtotal],
            ["Envío", o.shipping],
            ["Recargo Mercado Pago", o.surcharge],
          ].map(([n, v]) => (
            <div key={n}>
              <span>{n}</span>
              <span>{money(v)}</span>
            </div>
          ))}
        </details>
        <div className="order-actions">
          {o.payment === "transfer" && o.paymentStatus === "unpaid" && o.status !== "rejected" && (
            <div className="notice">
              Transferencia por confirmar. Revisa el comprobante en WhatsApp y tu banco antes de
              preparar.
              <button className="primary" onClick={() => confirmTransfer(o)}>
                Transferencia recibida
              </button>
            </div>
          )}
          {o.payment === "mp" && o.paymentStatus === "unpaid" && o.status !== "rejected" && (
            <div className="notice">
              Esperando confirmación de Mercado Pago. No prepares todavía.
              <button className="text-button" onClick={() => checkPayment(o)}>
                Consultar pago ahora
              </button>
            </div>
          )}
          {o.refundRequired && (
            <p className="notice">
              Reembolso pendiente: tramítalo en Mercado Pago. No se devuelve
              solo.
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
            <div className="action-pair">
              <button
                className="primary"
                onClick={() => update("/staff/orders/" + o.id, { status: "ready" })}
              >
                {o.delivery === "delivery" ? "Salió a entregar" : "Listo para recoger"}
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setMinutes(15);
                  setAction({ type: "eta", order: o });
                }}
              >
                Cambiar tiempo
              </button>
            </div>
          )}
          {o.status === "ready" && (
            <button
              className="primary go"
              onClick={() => update("/staff/orders/" + o.id, { status: "completed" })}
            >
              {o.payment === "cash" ? "Entregado y cobrado" : "Entregado"}
            </button>
          )}
          <div className="ticket-actions">
            <button className="whatsapp-button" onClick={() => openWhatsApp(o)}>
              WhatsApp
            </button>
            <button onClick={() => print(o, "kitchen")}>Comanda</button>
            <button onClick={() => print(o, "customer")}>Ticket</button>
            {["pending", "cooking"].includes(o.status) && (
              <button
                className="reject"
                onClick={() => {
                  setReason("");
                  setAction({ type: "reject", order: o });
                }}
              >
                Rechazar
              </button>
            )}
          </div>
        </div>
      </article>
    );
  };
  return (
    <main className="workspace kitchen">
      <div className="kitchen-head">
        <div>
          <h1>Cocina</h1>
          <p className="muted">
            {orders.filter((o) => o.status === "pending").length} nuevos ·{" "}
            {orders.filter((o) => o.status === "cooking").length} en preparación
          </p>
        </div>
        <span className={"live " + (connected ? "on" : "off")} role="status">
          <i aria-hidden="true" />
          {connected ? "En vivo" : "Reconectando…"}
        </span>
        <div className="kitchen-toolbar">
          <button
            className={"secondary " + (sound.enabled ? "enabled" : "attention")}
            onClick={sound.toggle}
          >
            {sound.enabled
              ? isNativeApp()
                ? "Probar alarma"
                : "Alarma activa · apagar"
              : "Activar alarma de pedidos"}
          </button>
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
            {catalog.availability?.until ? "Reanudar pedidos" : "Pausar 20 min"}
          </button>
          <div className="segmented small" role="tablist">
            {[
              ["active", "En curso"],
              ["all", "Últimas 24 h"],
            ].map(([v, n]) => (
              <button
                role="tab"
                aria-selected={filter === v}
                className={filter === v ? "active" : ""}
                onClick={() => setFilter(v)}
                key={v}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        {sound.message && (
          <p className="muted sound-message" role="status">
            {sound.message}
          </p>
        )}
      </div>
      {sound.pending > 0 && (
        <div className={"alarm-banner" + (sound.ringing ? " ringing" : "")} role="alert">
          <Mascot kind="devil" pose={sound.ringing ? "fiesta" : "guino"} tone="#fff" fill="#e10a0a" className="alarm-mascot" />
          <div>
            <b>{sound.pending === 1 ? "¡Pedido nuevo!" : "¡" + sound.pending + " pedidos nuevos!"}</b>
            <span>
              {sound.enabled
                ? sound.ringing
                  ? "Suena hasta que lo aceptes o lo silencies."
                  : "Silenciada. Volverá a sonar en 90 s si sigue sin aceptarse."
                : "La alarma está apagada: actívala para escuchar los pedidos."}
            </span>
          </div>
          {sound.ringing ? (
            <button onClick={sound.silence}>Silenciar</button>
          ) : (
            !sound.enabled && <button onClick={sound.toggle}>Activar alarma</button>
          )}
        </div>
      )}
      {catalog.availability && !catalog.availability.open && (
        <p className="notice">
          {catalog.availability.reason}
          {catalog.availability.until ? " Hasta " + time(catalog.availability.until) + "." : ""}
        </p>
      )}
      <div className={"board board-" + columns.length}>
        {columns.map(([status, title]) => {
          const list = visible.filter((o) => o.status === status);
          const shown = filter === "all" ? [...list].reverse().slice(0, 40) : list;
          return (
            <section className={"board-column col-" + status} key={status} aria-label={title}>
              <h2>
                {title} <span>{list.length}</span>
              </h2>
              {shown.map(card)}
              {!list.length && (
                <p className="column-empty">
                  {status === "pending" ? "Sin pedidos nuevos. Te avisaremos con sonido." : "Nada por aquí."}
                </p>
              )}
            </section>
          );
        })}
      </div>
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
                  {action.order.payment !== "cash" &&
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
