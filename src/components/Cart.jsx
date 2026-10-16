import React, { useState, useEffect } from "react";
import { ShoppingBag, Minus, Plus, ArrowRight, Check } from "lucide-react";
import { api, money } from "../api";
import Tracking from "./Tracking";
import { price as calculate } from "../../server/domain.js";
export default function Cart({
  cart,
  setCart,
  catalog,
  run,
  tracking,
  setTracking,
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
  return (
    <aside className="cart">
      <div className="cart-title">
        <h2>
          <ShoppingBag size={21} />
          Tu pedido
        </h2>
        <span>{cart.reduce((s, i) => s + i.quantity, 0)}</span>
      </div>
      {tracking && (
        <Tracking
          order={tracking}
          timezone={catalog.settings?.timezone}
          onHide={() => {
            localStorage.removeItem("tracking");
            setTracking(null);
          }}
        />
      )}
      {!cart.length ? (
        <div className="empty">
          <ShoppingBag size={38} />
          <h3>Aquí empieza lo bueno</h3>
          <p>
            Agrega tus favoritos y nosotros
            <br />
            nos encargamos del antojo.
          </p>
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
                        </option>
                      ))}
                  </select>
                </label>
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
                pattern="\+?[0-9\s()\-]{10,20}"
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
              Efectivo<small>Sin recargo</small>
            </label>
            <label className="radio">
              <input
                type="radio"
                name="payment"
                checked={payment === "mp"}
                onChange={() => setPayment("mp")}
              />
              Mercado Pago<small>+4%</small>
            </label>
            {payment === "mp" && !catalog.digitalPayments && (
              <p className="notice">
                Mercado Pago está pendiente de conexión. Elige efectivo para
                confirmar.
              </p>
            )}
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
              (payment === "mp" && !catalog.digitalPayments)
            }
          >
            {busy ? "Confirmando…" : "Confirmar pedido"}
            <ArrowRight size={18} />
          </button>
          <small className="muted">
            El efectivo se cobra al recibir el pedido.
          </small>
        </form>
      )}
      <div className="cart-footer">
        <Check size={15} />
        Recién hecho. Como debe ser.
      </div>
    </aside>
  );
}
