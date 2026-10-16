import React, { useState } from "react";
import { ArrowRight, Clock, MapPin, Plus } from "lucide-react";
import Cart from "../components/Cart";
import ProductOptions from "../components/ProductOptions";
import { money } from "../api";
export default function Shop({ catalog, run, tracking, setTracking }) {
  const [category, setCategory] = useState("Todo"),
    [customize, setCustomize] = useState(null),
    [cart, setCart] = useState(() => {
      try {
        return JSON.parse(sessionStorage.getItem("cart") || "[]");
      } catch {
        return [];
      }
    });
  React.useEffect(() => {
    sessionStorage.setItem("cart", JSON.stringify(cart));
  }, [cart]);
  function add(p, selections = {}, notes = "") {
    const optionLabels = [];
    let extra = 0;
    for (const g of p.options || [])
      for (const id of selections[g.id] || []) {
        const c = g.choices.find((c) => c.id === id);
        if (c) {
          extra += c.price;
          optionLabels.push(g.name + ": " + c.label);
        }
      }
    const lineKey =
      p.id +
      "-" +
      JSON.stringify(Object.fromEntries(Object.entries(selections).sort())) +
      "-" +
      notes;
    setCart((current) =>
      current.some((i) => i.lineKey === lineKey)
        ? current.map((i) =>
            i.lineKey === lineKey
              ? { ...i, quantity: Math.min(30, i.quantity + 1) }
              : i,
          )
        : [
            ...current,
            {
              ...p,
              price: p.price + extra,
              basePrice: p.price,
              selections,
              optionLabels,
              lineKey,
              quantity: 1,
              notes,
              available: true,
            },
          ],
    );
  }
  return (
    <>
      {customize && (
        <ProductOptions
          product={customize}
          onClose={() => setCustomize(null)}
          onAdd={(selections, notes) => add(customize, selections, notes)}
        />
      )}
      {catalog.availability && !catalog.availability.open && (
        <div className="business-notice" role="status">
          <b>Pedidos pausados</b>
          <span>{catalog.availability.reason}</span>
          {catalog.availability.until && (
            <span>
              Hasta{" "}
              {new Date(catalog.availability.until).toLocaleTimeString(
                "es-MX",
                {
                  timeZone: catalog.settings?.timezone || "America/Mexico_City",
                  hour: "2-digit",
                  minute: "2-digit",
                },
              )}
            </span>
          )}
        </div>
      )}
      <section className="hero">
        <div>
          <span className="eyebrow">EL ANTOJO TIENE NOMBRE</span>
          <h1>
            Un poco de hambre.
            <br />
            Mucho <em>Santos.</em>
          </h1>
          <p>
            Tu próximo antojo favorito, recién preparado.
            <br />
            Pide, disfruta y repite.
          </p>
          <a className="primary" href="#menu">
            Explorar el menú
            <ArrowRight size={18} />
          </a>
          <div className="hero-meta">
            <span>
              <Clock size={15} />
              Hecho al momento
            </span>
            <span>
              <MapPin size={15} />
              Recoge o pide a domicilio
            </span>
          </div>
        </div>
        <div className="hero-image">
          <img
            src="/images/food-1.jpg"
            alt="Hamburguesa de la casa con queso y vegetales"
          />
          <span className="sticker">
            100%<b>ANTOJO</b>
            <small>0% CULPA</small>
          </span>
          <div className="photo-label">
            LA FAVORITA DE LA CASA<b>Burger Santa ↗</b>
          </div>
        </div>
      </section>
      <main className="shop-layout" id="menu">
        <section>
          <div className="section-title">
            <div>
              <span className="eyebrow">ALGO PARA CADA ANTOJO</span>
              <h2>
                Nuestro menú<span className="dot">.</span>
              </h2>
            </div>
            <span className="muted">Preparado con todo el sabor.</span>
          </div>
          <div className="categories">
            {["Todo", ...new Set(catalog.products.map((p) => p.category))].map(
              (c) => (
                <button
                  key={c}
                  className={category === c ? "active" : ""}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ),
            )}
          </div>
          <div className="product-grid">
            {catalog.products
              .filter((p) => category === "Todo" || p.category === category)
              .map((p) => (
                <article
                  key={p.id}
                  className={"product " + (!p.active ? "soldout" : "")}
                >
                  <div className="product-photo">
                    <img
                      loading="lazy"
                      src={p.image}
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = "/images/placeholder.svg";
                      }}
                      alt={p.name}
                    />
                    {!p.active ? (
                      <span>{p.unavailableReason || "Agotado por ahora"}</span>
                    ) : (
                      p.id === 1 && <span className="favorite">★ FAVORITA</span>
                    )}
                  </div>
                  <div className="product-info">
                    <small>{p.category}</small>
                    <h3>{p.name}</h3>
                    <p>{p.description}</p>
                    <div className="product-bottom">
                      <b>{money(p.price)}</b>
                      <button
                        disabled={!p.active}
                        onClick={() =>
                          p.options?.length ? setCustomize(p) : add(p)
                        }
                        aria-label={"Agregar " + p.name}
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
          </div>
          <p className="menu-footnote">
            Buenos ingredientes. Buena compañía. Buenos Santos.
          </p>
        </section>
        <Cart {...{ cart, setCart, catalog, run, tracking, setTracking }} />
      </main>
    </>
  );
}
