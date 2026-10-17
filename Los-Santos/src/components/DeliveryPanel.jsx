import React, { useState } from "react";
import { api, money } from "../api";
export default function DeliveryPanel({ catalog, update, run, refresh }) {
  const [name, setName] = useState(""),
    [fee, setFee] = useState(""),
    [minutes, setMinutes] = useState("20");
  return (
    <div className="admin-grid">
      <section className="panel">
        <h2>Colonias y costo de envío</h2>
        <p className="muted">
          El cliente elige su colonia: el envío se suma solo y ve cuántos
          minutos tarda en llegar después de que el pedido sale del local.
          Desactiva una colonia en lugar de borrarla para conservar el historial.
        </p>
        <div className="zone-row zone-head" aria-hidden="true">
          <span>Colonia</span>
          <span>Envío MXN</span>
          <span>Traslado (min)</span>
          <span>Estado</span>
        </div>
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
            <input
              aria-label={"Minutos de traslado a " + z.name}
              type="number"
              min="1"
              max="180"
              step="1"
              defaultValue={z.deliveryMinutes ?? 20}
              key={z.id + "-" + z.deliveryMinutes}
              onBlur={(e) => {
                const deliveryMinutes = Math.round(Number(e.target.value));
                if (deliveryMinutes !== z.deliveryMinutes)
                  update("/staff/zones/" + z.id, { deliveryMinutes });
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
                deliveryMinutes: Math.round(Number(minutes)),
              });
              await refresh();
              return z;
            });
            if (result) {
              setName("");
              setFee("");
              setMinutes("20");
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
          <input
            required
            aria-label="Minutos de traslado nueva colonia"
            type="number"
            min="1"
            max="180"
            placeholder="Min"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
          <button className="primary" aria-label="Agregar colonia">
            +
          </button>
        </form>
      </section>
    </div>
  );
}
