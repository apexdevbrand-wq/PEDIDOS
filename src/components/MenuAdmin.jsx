import React, { useState, useEffect } from "react";
import { api, money } from "../api";
import ProductEditor from "./ProductEditor";
export default function MenuAdmin({ catalog, update, run, refresh }) {
  const [name, setName] = useState(""),
    [fee, setFee] = useState(""),
    [ingredients, setIngredients] = useState([]),
    [edit, setEdit] = useState(null);
  useEffect(() => {
    run(async () => setIngredients(await api("/staff/ingredients")));
  }, []);
  return (
    <div className="admin-grid">
      <section className="panel">
        <h2>Menú y disponibilidad</h2>
        <p className="muted">Precios, extras y disponibilidad por insumo.</p>
        {catalog.products.map((p) => (
          <div className="menu-admin-item" key={p.id}>
            <div className="admin-row">
              <img src={p.image} alt="" />
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
                role="switch"
                aria-checked={p.enabled}
                aria-label={"Disponibilidad de " + p.name}
                className={"toggle " + (p.enabled ? "on" : "")}
                onClick={() =>
                  update("/staff/products/" + p.id, { active: !p.enabled })
                }
              >
                <span />
              </button>
            </div>
            <div className="line">
              <small
                className={p.unavailableReason ? "stock-warning" : "muted"}
              >
                {p.unavailableReason ||
                  `${(p.options || []).length} grupos de opciones`}
              </small>
              <button className="text-button" onClick={() => setEdit(p)}>
                Opciones e insumos
              </button>
            </div>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Colonias y tarifas</h2>
        <p className="muted">
          Desactiva una colonia para conservar su historial.
        </p>
        {catalog.zones.map((z) => (
          <div className="zone-row" key={z.id}>
            <input
              aria-label={"Nombre de " + z.name}
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
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await run(async () => {
              const z = await api("/staff/zones", "POST", {
                name,
                fee: Math.round(Number(fee) * 100),
              });
              await refresh();
              return z;
            });
            if (result) {
              setName("");
              setFee("");
            }
          }}
        >
          <input
            required
            placeholder="Nueva colonia"
            aria-label="Nueva colonia"
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
            +
          </button>
        </form>
      </section>
      {edit && (
        <ProductEditor
          product={edit}
          ingredients={ingredients}
          onClose={() => setEdit(null)}
          run={run}
          refresh={refresh}
        />
      )}
    </div>
  );
}
