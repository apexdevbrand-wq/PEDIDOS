import React, { useState, useEffect } from "react";
import { api, money, labels } from "../api";
export function printHtml(
  html,
  popup = window.open("", "_blank", "width=420,height=720"),
) {
  if (!popup)
    throw Error("Permite ventanas emergentes para imprimir el ticket.");
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  popup.print();
}
const decodeKey = (key) =>
  Uint8Array.from(
    atob(
      key
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(key.length / 4) * 4, "="),
    ),
    (c) => c.charCodeAt(0),
  );
export default function Tracking({
  order,
  onHide,
  timezone = "America/Mexico_City",
}) {
  const [message, setMessage] = useState(""),
    [subscribed, setSubscribed] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setSubscribed(false);
    setMessage("");
  }, [order.id]);
  async function enable() {
    setBusy(true);
    try {
      if (
        !window.isSecureContext ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      )
        throw Error(
          "Este navegador no admite avisos push aquí. En iPhone añade la app a Inicio; para acceso público se necesita HTTPS.",
        );
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw Error(
          "No se autorizaron avisos. Puedes cambiar el permiso en los ajustes del navegador.",
        );
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                Error(
                  "No se pudo activar el servicio de avisos. Revisa permisos y conexión.",
                ),
              ),
            10000,
          ),
        ),
      ]);
      const { publicKey } = await api("/push/key");
      const sub =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeKey(publicKey),
        }));
      await api("/orders/" + order.id + "/push", "POST", sub.toJSON());
      setSubscribed(true);
      setMessage(
        "Avisos activados para este pedido. La entrega depende del navegador y la conexión.",
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub)
        await api("/orders/" + order.id + "/push", "DELETE", {
          endpoint: sub.endpoint,
        });
      setSubscribed(false);
      setMessage("Avisos desactivados para este pedido.");
    } catch (e) {
      setMessage(e.message);
    }
  }
  return (
    <section className={"tracking tracking-" + order.status} aria-live="polite">
      <small>TU PEDIDO · {order.folio}</small>
      <h3>
        {order.status === "ready"
          ? order.delivery === "delivery"
            ? "En camino"
            : "Listo para recoger"
          : labels[order.status]}
      </h3>
      {order.estimatedReadyAt &&
        !["rejected", "completed"].includes(order.status) && (
          <p>
            <b>
              Hora estimada:{" "}
              {new Date(order.estimatedReadyAt).toLocaleTimeString("es-MX", {
                timeZone: timezone,
                hour: "2-digit",
                minute: "2-digit",
              })}
            </b>
            <br />
            El tiempo es aproximado.
          </p>
        )}
      {order.rejectionReason && (
        <p className="notice">
          <b>Motivo:</b> {order.rejectionReason}
        </p>
      )}
      {order.refundRequired && (
        <p className="notice">
          Tu pago requiere gestionar un reembolso. Contacta al negocio; el
          rechazo no devuelve dinero automáticamente.
        </p>
      )}
      <p>
        {money(order.total)} ·{" "}
        {order.paymentStatus === "paid"
          ? "Pagado"
          : order.paymentStatus === "refunded"
            ? "Reembolsado"
            : order.status === "rejected"
              ? "No cobrado"
              : "Pago pendiente"}
      </p>
      <div className="tracking-actions">
        <button disabled={busy} onClick={subscribed ? disable : enable}>
          {busy
            ? "Activando…"
            : subscribed
              ? "Desactivar avisos"
              : "Activar avisos del pedido"}
        </button>
        <button
          onClick={async () => {
            const popup = window.open("", "_blank", "width=420,height=720");
            if (!popup) {
              setMessage("Permite ventanas emergentes para imprimir.");
              return;
            }
            try {
              const t = await api("/orders/" + order.id + "/ticket");
              printHtml(t.html, popup);
            } catch (e) {
              popup.close();
              setMessage(e.message);
            }
          }}
        >
          Imprimir comprobante
        </button>
        <button onClick={onHide}>Ocultar seguimiento</button>
      </div>
      {message && (
        <p className="push-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
