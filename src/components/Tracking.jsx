import React, { useState, useEffect } from "react";
import { api, money } from "../api";
import Mascot from "./Mascot";
import { arrival } from "../../server/domain.js";
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
  settings = {},
}) {
  const trip = arrival(order);
  const clock = (iso) =>
    new Date(iso).toLocaleTimeString("es-MX", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
    });
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
      {["ready", "completed"].includes(order.status) && (
        <Mascot kind="angel" pose="fiesta" className="tracking-mascot" />
      )}
      <small>Pedido {order.folio}</small>
      <h3>
        {order.status === "pending"
          ? "Recibido"
          : order.status === "cooking"
            ? "Preparando"
            : order.status === "ready"
              ? order.delivery === "delivery"
                ? "En camino"
                : "Listo para recoger"
              : order.status === "completed"
                ? "Entregado"
                : "No pudimos aceptarlo"}
      </h3>
      {order.status !== "rejected" && (
        <ol className="progress" aria-label="Avance del pedido">
          {["pending", "cooking", "ready", "completed"].map((step, i, all) => (
            <li
              key={step}
              className={all.indexOf(order.status) >= i ? "done" : ""}
              aria-current={order.status === step ? "step" : undefined}
            >
              {step === "pending"
                ? "Recibido"
                : step === "cooking"
                  ? "Cocina"
                  : step === "ready"
                    ? order.delivery === "delivery"
                      ? "En camino"
                      : "Listo"
                    : "Entregado"}
            </li>
          ))}
        </ol>
      )}
      {order.status === "pending" && (
        <p className="muted">
          La cocina lo revisará en unos minutos y te diremos la hora estimada.
          {trip ? ` Una vez que salga, el traslado a tu colonia toma unos ${trip.minutes} min.` : ""}
        </p>
      )}
      {trip?.at && ["cooking", "ready"].includes(order.status) && (
        <p className={"arrival" + (trip.dispatched ? " is-live" : "")}>
          <small>{trip.dispatched ? "Llega aproximadamente a las" : "Llegada aproximada"}</small>
          <b>{clock(trip.at)}</b>
          <span>
            {trip.dispatched
              ? `Salió del local; ${order.zone} queda a unos ${trip.minutes} min.`
              : `Sale hacia las ${clock(order.estimatedReadyAt)} + ${trip.minutes} min de camino a ${order.zone}.`}
          </span>
        </p>
      )}
      {order.estimatedReadyAt && !trip?.at && ["pending", "cooking"].includes(order.status) && (
        <p className="arrival">
          <small>{order.delivery === "delivery" ? "Sale del local aprox." : "Listo para recoger aprox."}</small>
          <b>{clock(order.estimatedReadyAt)}</b>
          <span>El tiempo es aproximado.</span>
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
      {order.payment === "transfer" && order.status !== "rejected" && (
        order.paymentStatus === "paid" ? (
          <p className="pay-confirmed">Transferencia confirmada. ¡Gracias!</p>
        ) : (
          <TransferBox order={order} settings={settings} />
        )
      )}
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

function CopyRow({ label, value, display }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <div className="copy-row">
      <span>{label}</span>
      <b>{display || value}</b>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {}
        }}
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

// Datos para transferir y botón para mandar el comprobante por WhatsApp.
function TransferBox({ order, settings }) {
  const phone = (settings.countryCode || "52") + (settings.receiptWhatsapp || "");
  const text =
    `Hola Los Santos, envío mi comprobante de transferencia del pedido ${order.folio} ` +
    `por ${money(order.total)} a nombre de ${order.name}.`;
  const group = (v) => v.replace(/(\d{4})(?=\d)/g, "$1 ");
  return (
    <section className="transfer-box" aria-label="Datos para transferir">
      <h4>Paga por transferencia</h4>
      <p>
        Transfiere <b>{money(order.total)}</b> y envíanos tu comprobante. Empezamos a preparar tu
        pedido en cuanto lo confirmemos.
      </p>
      <CopyRow label="Banco" value={settings.transferBank} />
      <CopyRow label="Titular" value={settings.transferHolder} />
      <CopyRow label="CLABE" value={settings.transferClabe} display={settings.transferClabe && group(settings.transferClabe)} />
      <CopyRow label="Cuenta / tarjeta" value={settings.transferAccount} display={settings.transferAccount && group(settings.transferAccount)} />
      <CopyRow label="Monto" value={(order.total / 100).toFixed(2)} display={money(order.total)} />
      <CopyRow label="Concepto" value={order.folio} />
      {settings.receiptWhatsapp && (
        <a
          className="primary full whatsapp-cta"
          href={"https://wa.me/" + phone + "?text=" + encodeURIComponent(text)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Enviar comprobante por WhatsApp
        </a>
      )}
    </section>
  );
}
