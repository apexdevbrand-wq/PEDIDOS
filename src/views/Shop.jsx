import React, { useState } from "react";
import { ArrowRight, Clock, MapPin, Plus } from "lucide-react";
import Cart from "../components/Cart";
import { money } from "../api";
export default function Shop({ catalog, run, tracking, setTracking }) {
  const [category, setCategory] = useState("Todo"),
    [cart, setCart] = useState([]);
  const add = (p) =>
    setCart((c) =>
      c.some((i) => i.id === p.id)
        ? c.map((i) =>
            i.id === p.id
              ? { ...i, quantity: Math.min(30, i.quantity + 1) }
              : i,
          )
        : [...c, { ...p, quantity: 1, notes: "" }],
    );
  return (
    <>
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
                      <span>Agotado por ahora</span>
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
                        onClick={() => add(p)}
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
