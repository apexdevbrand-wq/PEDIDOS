import React, { useState } from "react";
import { Plus } from "lucide-react";
import { api, money, today, dayOf } from "../api";
export default function Admin({ catalog, orders, update, run, refresh }) {
  const [name, setName] = useState(""),
    [fee, setFee] = useState("");
  const daily = orders.filter(
    (o) => dayOf(o.createdAt) === today() && o.paymentStatus === "paid",
  );
  return (
    <main className="workspace">
      <div className="section-title">
        <div>
          <span className="eyebrow">TODO BAJO CONTROL</span>
          <h1>
            Tu negocio, al día<span className="dot">.</span>
          </h1>
          <p className="muted">
            Cobros de pedidos del día · Hora de Ciudad de México
          </p>
        </div>
        <span className="badge">{today()}</span>
      </div>
      <div className="metrics">
        {[
          ["Ventas cobradas", daily.reduce((s, o) => s + o.total, 0)],
          [
            "Efectivo",
            daily
              .filter((o) => o.payment === "cash")
              .reduce((s, o) => s + o.total, 0),
          ],
          [
            "Mercado Pago",
            daily
              .filter((o) => o.payment === "mp")
              .reduce((s, o) => s + o.total, 0),
          ],
          ["Envíos cobrados", daily.reduce((s, o) => s + o.shipping, 0)],
        ].map(([n, v]) => (
          <article key={n}>
            <small>{n}</small>
            <h2>{money(v)}</h2>
            <span className="muted">Hoy</span>
          </article>
        ))}
      </div>
      <div className="admin-grid">
        <section className="panel">
          <h2>Menú y disponibilidad</h2>
          <p className="muted">
            Los cambios se reflejan al instante en el catálogo.
          </p>
          {catalog.products.map((p) => (
            <div className="admin-row" key={p.id}>
              <img
                src={p.image}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "/images/placeholder.svg";
                }}
                alt=""
              />
              <div className="grow">
                <b>{p.name}</b>
                <small>{p.category}</small>
              </div>
              <label className="price-label">
                MXN
                <input
                  aria-label={"Precio de " + p.name}
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={(p.price / 100).toFixed(2)}
                  key={p.id + "-" + p.price}
                  onBlur={(e) => {
                    const price = Math.round(Number(e.target.value) * 100);
                    if (price !== p.price)
                      update("/staff/products/" + p.id, { price });
                  }}
                />
              </label>
              <button
                className={"toggle " + (p.active ? "on" : "")}
                role="switch"
                aria-checked={p.active}
                aria-label={"Disponibilidad de " + p.name}
                onClick={() =>
                  update("/staff/products/" + p.id, { active: !p.active })
                }
              >
                <span />
              </button>
            </div>
          ))}
        </section>
        <div>
          <section className="panel">
            <h2>Colonias y tarifas</h2>
            <p className="muted">Cobertura de tus entregas a domicilio.</p>
            {catalog.zones.map((z) => (
              <div className="zone-row" key={z.id}>
                <input
                  aria-label="Nombre de colonia"
                  defaultValue={z.name}
                  onBlur={(e) => {
                    if (e.target.value !== z.name)
                      update("/staff/zones/" + z.id, { name: e.target.value });
                  }}
                />
                <input
                  aria-label={"Tarifa de " + z.name}
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={z.fee / 100}
                  onBlur={(e) => {
                    const fee = Math.round(Number(e.target.value) * 100);
                    if (fee !== z.fee) update("/staff/zones/" + z.id, { fee });
                  }}
                />
                <button
                  className={z.active ? "zone-active" : ""}
                  onClick={() =>
                    update("/staff/zones/" + z.id, { active: !z.active })
                  }
                >
                  {z.active ? "Activa" : "Inactiva"}
                </button>
              </div>
            ))}
            <form
              className="zone-form"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api("/staff/zones", "POST", {
                    name,
                    fee: Math.round(Number(fee) * 100),
                  });
                  setName("");
                  setFee("");
                  await refresh();
                });
              }}
            >
              <input
                required
                aria-label="Nueva colonia"
                placeholder="Nueva colonia"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                required
                aria-label="Tarifa nueva colonia"
                type="number"
                min="0"
                step="0.01"
                placeholder="$ Envío"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
              <button className="primary" aria-label="Agregar colonia">
                <Plus size={18} />
              </button>
            </form>
          </section>
          <section className="panel colony-stats">
            <h2>Pedidos por colonia</h2>
            <p className="muted">Pedidos de hoy, sin rechazados.</p>
            {catalog.zones.map((z) => (
              <div className="line" key={z.id}>
                <span>{z.name}</span>
                <b>
                  {
                    orders.filter(
                      (o) =>
                        o.zoneId === z.id &&
                        o.status !== "rejected" &&
                        dayOf(o.createdAt) === today(),
                    ).length
                  }
                </b>
              </div>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
