import React, { useState, useEffect, useMemo, useRef } from "react";
import { MapPin, Bike, ShoppingBag, Plus, Star } from "lucide-react";
import Cart from "../components/Cart";
import ProductOptions from "../components/ProductOptions";
import ProductPhoto from "../components/ProductPhoto";
import Mascot from "../components/Mascot";
import { money } from "../api";

const slugify = (s) =>
  "cat-" +
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-");

export default function Shop({ catalog, run, tracking, setTracking }) {
  const [customize, setCustomize] = useState(null),
    [current, setCurrent] = useState(""),
    [cartOpen, setCartOpen] = useState(false),
    [bump, setBump] = useState(0),
    [cart, setCart] = useState(() => {
      try {
        return JSON.parse(sessionStorage.getItem("cart") || "[]");
      } catch {
        return [];
      }
    });
  const navRef = useRef(null);
  useEffect(() => {
    try {
      sessionStorage.setItem("cart", JSON.stringify(cart));
    } catch {}
  }, [cart]);

  const sections = useMemo(() => {
    const names = catalog.categories?.length
      ? catalog.categories.map((c) => c.name)
      : [...new Set(catalog.products.map((p) => p.category))];
    return names
      .map((name) => ({
        name,
        id: slugify(name),
        products: catalog.products.filter((p) => p.category === name),
      }))
      .filter((s) => s.products.length);
  }, [catalog.products, catalog.categories]);

  // Resalta la categoría visible mientras la persona recorre el menú.
  useEffect(() => {
    if (!sections.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setCurrent(visible.target.id);
      },
      { rootMargin: "-140px 0px -55% 0px" },
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    // Arriba, en la portada, ninguna categoría queda marcada.
    const onScroll = () => {
      const menu = document.getElementById("menu");
      if (menu && window.scrollY < menu.offsetTop - 220) setCurrent("");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [sections]);
  useEffect(() => {
    // Solo desplaza la barra de categorías en horizontal; nunca la página.
    const nav = navRef.current;
    const chip = nav?.querySelector(`[data-target="${current}"]`);
    if (nav && chip)
      nav.scrollTo({
        left: chip.offsetLeft - nav.clientWidth / 2 + chip.clientWidth / 2,
        behavior: "smooth",
      });
  }, [current]);

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
              id: p.id,
              name: p.name,
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
    setBump((b) => b + 1);
  }

  const settings = catalog.settings || {};
  const open = catalog.availability?.open !== false;
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const combosFrom = Math.min(
    ...catalog.products.filter((p) => p.category === "Combos" && p.active).map((p) => p.price),
  );
  const favorites = catalog.products.filter((p) => p.featured && p.active).slice(0, 10);
  const tagline = (name) => catalog.categories?.find((c) => c.name === name)?.tagline;
  const pick = (p) => (p.options?.length ? setCustomize(p) : add(p));
  const fromPrice = (p) => {
    const required = (p.options || []).filter((g) => g.min > 0);
    const varies = required.some((g) => g.choices.some((c) => c.price > 0));
    return (varies ? "desde " : "") + money(p.price).replace(".00", "");
  };
  // Personajes que acompañan algunas secciones del menú.
  const sidekick = (i) =>
    [
      ["devil", "antojo"],
      ["angel", "hola"],
      ["devil", "guino"],
      ["angel", "antojo"],
    ][i % 4];

  return (
    <>
      {customize && (
        <ProductOptions
          product={customize}
          onClose={() => setCustomize(null)}
          onAdd={(selections, notes) => add(customize, selections, notes)}
        />
      )}
      <section className="hero">
        <div className="hero-copy">
          <h1 aria-label="¿Qué se te antoja hoy?">
            <span className="h-line">¿Qué se te</span>
            <span className="h-line">
              <em>antoja</em> hoy?
            </span>
          </h1>
          <p className="hero-tagline">
            {settings.tagline || "El sabor que te mereces."} Miches, hamburguesas, alitas, la Elotiza
            y aguachile, hechos al momento en Minatitlán.
          </p>
          <div className="hero-actions">
            <a className="hero-cta" href="#menu">
              Ver la carta
            </a>
            <span className={"status-chip " + (open ? "is-open" : "is-closed")}>
              <i aria-hidden="true" />
              {open ? "Recibiendo pedidos" : "Pedidos en pausa"}
            </span>
          </div>
          <ul className="hero-facts">
            <li>
              <ShoppingBag size={16} aria-hidden="true" />
              Pasa a recoger sin costo
            </li>
            <li>
              <Bike size={16} aria-hidden="true" />
              A domicilio, con tiempo de entrega por colonia
            </li>
            {settings.address && (
              <li>
                <MapPin size={16} aria-hidden="true" />
                {settings.address}
              </li>
            )}
          </ul>
        </div>
        <div className="hero-board">
          <span className="ribbon hero-ribbon">Drinks, snacks &amp; más</span>
          <picture>
            <source
              type="image/webp"
              srcSet="/images/hero-santos-800.webp 800w, /images/hero-santos.webp 1536w"
              sizes="(max-width: 1000px) 100vw, 50vw"
            />
            <img
              className="hero-photo"
              src="/images/hero-santos.jpg"
              srcSet="/images/hero-santos-800.jpg 800w, /images/hero-santos.jpg 1536w"
              sizes="(max-width: 1000px) 100vw, 50vw"
              width="1536"
              height="1024"
              fetchPriority="high"
              alt="El diablito y el ángel de Los Santos se asoman tras una hamburguesa con tocino y piña, café frío, esquites y elote"
            />
          </picture>
          {Number.isFinite(combosFrom) && (
            <a className="burst hero-burst" href={"#" + slugify("Combos")}>
              <small>Combos desde</small>
              <b>{money(combosFrom).replace(".00", "")}</b>
            </a>
          )}
        </div>
      </section>

      {!open && (
        <div className="business-notice" role="status">
          <Mascot kind="devil" pose="duerme" className="notice-mascot" />
          <div>
            <b>Por ahora no estamos recibiendo pedidos.</b>
            <span>
              {catalog.availability.reason}
              {catalog.availability.until &&
                " Volvemos a las " +
                  new Date(catalog.availability.until).toLocaleTimeString("es-MX", {
                    timeZone: settings.timezone || "America/Mexico_City",
                    hour: "2-digit",
                    minute: "2-digit",
                  }) +
                  "."}
            </span>
          </div>
        </div>
      )}

      <nav className="menu-nav" aria-label="Categorías del menú" ref={navRef}>
        {sections.map((s) => (
          <a
            key={s.id}
            href={"#" + s.id}
            data-target={s.id}
            className={current === s.id ? "active" : ""}
            aria-current={current === s.id ? "true" : undefined}
          >
            {s.name}
          </a>
        ))}
      </nav>

      <main className="shop-layout" id="menu">
        <div className="menu-column">
          {favorites.length > 0 && (
            <section className="favorites" aria-labelledby="fav-t">
              <div className="favorites-head">
                <Mascot kind="devil" pose="antojo" className="fav-mascot" />
                <div>
                  <h2 id="fav-t">Los consentidos</h2>
                  <p>Lo que más se pide en Los Santos.</p>
                </div>
              </div>
              <div className="favorites-track">
                {favorites.map((p) => (
                  <article className="fav-card" key={p.id}>
                    <div className="fav-photo">
                      <ProductPhoto product={p} />
                    </div>
                    <h3>{p.name}</h3>
                    <div className="fav-bottom">
                      <b>{fromPrice(p)}</b>
                      <button
                        className="plus"
                        disabled={!open}
                        onClick={() => pick(p)}
                        aria-label={"Agregar " + p.name + " al pedido"}
                      >
                        <Plus size={20} aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {!sections.length && (
            <p className="empty-menu">Estamos preparando la carta. Vuelve en un momento.</p>
          )}
          <div className="carta-boards">
            {sections.map((s, i) => {
              const [kind, pose] = sidekick(i);
              return (
                <section key={s.id} id={s.id} className="carta-board" aria-labelledby={s.id + "-t"}>
                  {tagline(s.name) && <span className="ribbon">{tagline(s.name)}</span>}
                  <div className="board-panel">
                    <header className="board-head">
                      <h2 id={s.id + "-t"}>{s.name}</h2>
                      {i % 2 === 0 && (
                        <Mascot
                          kind={kind}
                          pose={pose}
                          tone={kind === "devil" ? "#fff" : undefined}
                          fill="#c80808"
                          className="board-mascot"
                        />
                      )}
                    </header>
                    <ul className="board-list">
                      {s.products.map((p) => (
                        <li key={p.id} className={"menu-row" + (!p.active ? " soldout" : "")}>
                          <button
                            className="row-hit"
                            disabled={!p.active || !open}
                            onClick={() => pick(p)}
                            aria-label={
                              p.active
                                ? `Agregar ${p.name}, ${fromPrice(p)}`
                                : `${p.name}: agotado por hoy`
                            }
                          >
                            {p.image ? (
                              <span className="row-thumb">
                                <ProductPhoto product={p} />
                              </span>
                            ) : (
                              <span className="row-thumb is-empty" aria-hidden="true" />
                            )}
                            <span className="row-text">
                              <span className="row-name">
                                {p.name}
                                {p.featured && <Star size={13} className="row-star" aria-hidden="true" />}
                              </span>
                              {p.description && <span className="row-desc">{p.description}</span>}
                              {!p.active && <span className="row-out">Agotado por hoy</span>}
                            </span>
                            <span className="row-price">{fromPrice(p)}</span>
                            <span className="row-plus" aria-hidden="true">
                              <Plus size={18} />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              );
            })}
          </div>
        </div>
        <Cart
          {...{ cart, setCart, catalog, run, tracking, setTracking }}
          open={cartOpen}
          onClose={() => setCartOpen(false)}
        />
      </main>

      {(count > 0 || tracking) && !cartOpen && (
        <button
          key={bump}
          className="cart-bar"
          onClick={() => setCartOpen(true)}
          aria-label={count ? `Ver pedido: ${count} productos, ${money(total)}` : "Ver seguimiento del pedido"}
        >
          <span className="cart-bar-count">{count || "✓"}</span>
          <span>{count ? "Ver mi pedido" : "Seguir mi pedido"}</span>
          {count > 0 && <b>{money(total)}</b>}
        </button>
      )}
    </>
  );
}
