import React, { useState, useEffect } from "react";
import { ShoppingBag, Minus, Plus, X } from "lucide-react";
import { api, money } from "../api";
import Tracking from "./Tracking";
import Mascot from "./Mascot";
import { price as calculate, transferEnabled } from "../../server/domain.js";
export default function Cart({
  cart,
  setCart,
  catalog,
  run,
  tracking,
  setTracking,
  open = false,
  onClose = () => {},
}) {
  const [delivery, setDelivery] = useState("pickup"),
    [zoneId, setZone] = useState(""),
    [payment, setPayment] = useState("cash"),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setCart((c) =>
      c.map((i) => {
        const p = catalog.products.find((p) => p.id === i.id);
        if (!p) return { ...i, available: false };
        try {
          const line = calculate(
            [{ id: i.id, quantity: 1, selections: i.selections || {} }],
            [p],
            null,
            "pickup",
            "cash",
          ).lines[0];
          return {
            ...i,
            price: line.price,
            basePrice: line.basePrice,
            optionLabels: line.optionLabels,
            available: true,
          };
        } catch {
          return { ...i, available: false };
        }
      }),
    );
  }, [catalog.products]);
  const qty = (lineKey, d) =>
    setCart((c) =>
      c
        .map((i) =>
          i.lineKey === lineKey ? { ...i, quantity: i.quantity + d } : i,
        )
        .filter((i) => i.quantity > 0),
    );
  const transferOk = transferEnabled(catalog.settings);
  const selectedZone =
    delivery === "delivery" ? catalog.zones.find((z) => z.id === Number(zoneId)) : null;
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0),
    shipping =
      delivery === "delivery"
        ? catalog.zones.find((z) => z.id === Number(zoneId))?.fee || 0
        : 0,
    surcharge = payment === "mp" ? Math.round((subtotal + shipping) * 0.04) : 0;
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const f = new FormData(e.target);
    const data = {
      name: f.get("name"),
      phone: f.get("phone"),
      address: f.get("address"),
      delivery,
      zoneId,
      payment,
      expectedTotal: subtotal + shipping + surcharge,
      items: cart.map(({ id, quantity, notes, selections }) => ({
        id,
        quantity,
        notes,
        selections,
      })),
    };
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify({ ...data, expectedTotal: undefined }),
      ),
    );
    const fingerprint = Array.from(new Uint8Array(bytes))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    let request;
    try {
      request = JSON.parse(
        sessionStorage.getItem("checkout-request") || "null",
      );
    } catch {}
    if (!request || request.fingerprint !== fingerprint) {
      request = { fingerprint, id: crypto.randomUUID() };
      sessionStorage.setItem("checkout-request", JSON.stringify(request));
    }
    const o = await run(() =>
      api("/orders", "POST", { ...data, requestId: request.id }),
    );
    if (o) {
      localStorage.setItem("tracking", o.id);
      setTracking(o);
      setCart([]);
      sessionStorage.removeItem("checkout-request");
      if (o.checkoutUrl) window.location.assign(o.checkoutUrl);
    }
    setBusy(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.classList.add("sheet-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("sheet-open");
    };
  }, [open]);
  return (
    <>
    {open && <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />}
    <aside
      className={"cart" + (open ? " is-open" : "")}
      aria-label="Tu pedido"
      {...(open ? { role: "dialog", "aria-modal": "true" } : {})}
    >
      <div className="cart-title">
        <h2>
          <ShoppingBag size={21} aria-hidden="true" />
          Tu pedido
        </h2>
        {cart.length > 0 && (
          <span className="cart-count">{cart.reduce((s, i) => s + i.quantity, 0)}</span>
        )}
        <button className="sheet-close" onClick={onClose} aria-label="Cerrar pedido">
          <X size={20} />
        </button>
      </div>
      {tracking && (
        <Tracking
          order={tracking}
          timezone={catalog.settings?.timezone}
          settings={catalog.settings}
          onHide={() => {
            localStorage.removeItem("tracking");
            setTracking(null);
          }}
        />
      )}
      {!cart.length ? (
        tracking ? null : <div className="empty">
          <Mascot kind="angel" pose="hola" className="empty-mascot" />
          <h3>Tu pedido está vacío</h3>
          <p>Toca “Agregar” en cualquier platillo para empezar.</p>
        </div>
      ) : (
        <form onSubmit={submit}>
          {cart.map((i) => (
            <div className="cart-item" key={i.lineKey}>
              <div className="line">
                <b>{i.name}</b>
                <span>{money(i.price * i.quantity)}</span>
              </div>
              {(i.optionLabels || []).map((label) => (
                <small className="cart-option" key={label}>
                  {label}
                </small>
              ))}
              {!i.available && (
                <p className="notice">
                  Este platillo o alguna opción se agotó. Retíralo y elige otra
                  opción.
                </p>
              )}
              <div className="quantity">
                <button
                  type="button"
                  onClick={() => qty(i.lineKey, -1)}
                  aria-label={"Quitar uno de " + i.name}
                >
                  <Minus size={14} />
                </button>
                <span>{i.quantity}</span>
                <button
                  type="button"
                  disabled={i.quantity >= 30}
                  onClick={() => qty(i.lineKey, 1)}
                  aria-label={"Añadir uno de " + i.name}
                >
                  <Plus size={14} />
                </button>
              </div>
              <input
                aria-label={"Notas para " + i.name}
                placeholder="¿Sin cebolla? Añade una nota"
                maxLength={300}
                value={i.notes}
                onChange={(e) =>
                  setCart((c) =>
                    c.map((x) =>
                      x.lineKey === i.lineKey
                        ? { ...x, notes: e.target.value }
                        : x,
                    ),
                  )
                }
              />
            </div>
          ))}
          <fieldset>
            <legend>¿Cómo lo quieres?</legend>
            <div className="segmented">
              <button
                type="button"
                className={delivery === "pickup" ? "active" : ""}
                onClick={() => setDelivery("pickup")}
              >
                Para recoger
              </button>
              <button
                type="button"
                className={delivery === "delivery" ? "active" : ""}
                onClick={() => setDelivery("delivery")}
              >
                A domicilio
              </button>
            </div>
            {delivery === "delivery" && (
              <>
                <label>
                  Colonia
                  <select
                    required
                    value={zoneId}
                    onChange={(e) => setZone(e.target.value)}
                  >
                    <option value="">Selecciona tu colonia</option>
                    {catalog.zones
                      .filter((z) => z.active)
                      .map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name} · {money(z.fee)}
                          {z.deliveryMinutes ? ` · ~${z.deliveryMinutes} min` : ""}
                        </option>
                      ))}
                  </select>
                </label>
                {selectedZone?.deliveryMinutes > 0 && (
                  <p className="delivery-time" role="status">
                    <b>Llega unos {selectedZone.deliveryMinutes} min después de salir del local.</b>
                    <span>
                      Primero lo preparamos (≈{catalog.settings?.defaultPrepMinutes || 25} min); al
                      aceptarlo te mostramos la hora exacta.
                    </span>
                  </p>
                )}
                <label>
                  Dirección y referencias
                  <textarea
                    name="address"
                    required
                    maxLength={500}
                    placeholder="Calle, número, entre calles…"
                  />
                </label>
              </>
            )}
          </fieldset>
          <fieldset>
            <legend>Tus datos</legend>
            <label>
              Nombre
              <input
                name="name"
                required
                maxLength={100}
                autoComplete="name"
                placeholder="¿A nombre de quién?"
              />
            </label>
            <label>
              Teléfono
              <input
                name="phone"
                type="tel"
                required
                pattern="[\d\s+\(\)\-]{10,20}"
                inputMode="tel"
                autoComplete="tel"
                placeholder="10 dígitos"
              />
            </label>
          </fieldset>
          <fieldset>
            <legend>Forma de pago</legend>
            <label className="radio">
              <input
                type="radio"
                name="payment"
                checked={payment === "cash"}
                onChange={() => setPayment("cash")}
              />
              Efectivo<small>Al recibir o recoger</small>
            </label>
            <label className={"radio" + (transferOk ? "" : " is-off")}>
              <input
                type="radio"
                name="payment"
                disabled={!transferOk}
                checked={payment === "transfer"}
                onChange={() => setPayment("transfer")}
              />
              Transferencia<small>{transferOk ? "Sin recargo" : "No disponible"}</small>
            </label>
            {payment === "transfer" && transferOk && (
              <p className="pay-hint">
                Al enviar tu pedido te mostramos los datos bancarios y un botón para mandar tu
                comprobante por WhatsApp. Empezamos a prepararlo en cuanto lo confirmemos.
              </p>
            )}
            <label className={"radio" + (catalog.digitalPayments ? "" : " is-off")}>
              <input
                type="radio"
                name="payment"
                disabled={!catalog.digitalPayments}
                checked={payment === "mp"}
                onChange={() => setPayment("mp")}
              />
              Tarjeta (Mercado Pago)
              <small>{catalog.digitalPayments ? "+4%" : "Muy pronto"}</small>
            </label>
          </fieldset>
          <div className="totals">
            <div>
              <span>Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            <div>
              <span>Envío</span>
              <span>{money(shipping)}</span>
            </div>
            {payment === "mp" && (
              <div>
                <span>Recargo Mercado Pago (4%)</span>
                <span>{money(surcharge)}</span>
              </div>
            )}
            <div className="total">
              <b>Total</b>
              <b>{money(subtotal + shipping + surcharge)}</b>
            </div>
          </div>
          <button
            className="primary checkout"
            disabled={
              busy ||
              cart.some((i) => !i.available) ||
              catalog.availability?.open === false ||
              (payment === "mp" && !catalog.digitalPayments) ||
              (payment === "transfer" && !transferOk)
            }
          >
            {busy
              ? "Enviando pedido…"
              : `Enviar pedido · ${money(subtotal + shipping + surcharge)}`}
          </button>
          <small className="muted checkout-note">
            {payment === "cash"
              ? "Pagas en efectivo al recibir o recoger."
              : payment === "transfer"
                ? "Después de enviar verás los datos para transferir."
                : "Te llevaremos a Mercado Pago para pagar."}
          </small>
        </form>
      )}
    </aside>
    </>
  );
}
