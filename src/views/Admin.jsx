import React, { useState } from "react";
import CashPanel from "../components/CashPanel";
import CatalogAdmin from "../components/CatalogAdmin";
import DeliveryPanel from "../components/DeliveryPanel";
import BusinessPanel from "../components/BusinessPanel";
import TeamPanel from "../components/TeamPanel";
import BackupPanel from "../components/BackupPanel";
export default function Admin(props) {
  const [tab, setTab] = useState("cash");
  if (!props.catalog.settings)
    return (
      <main className="workspace">
        <p role="status">Cargando administración…</p>
      </main>
    );
  return (
    <main className="workspace">
      <div className="admin-head">
        <h1>Administración</h1>
        <p className="muted">Menú, ventas, horarios, equipo y respaldos.</p>
      </div>
      <nav className="admin-tabs" aria-label="Secciones de administración">
        {[
          ["cash", "Ventas y caja"],
          ["catalog", "Catálogo"],
          ["delivery", "Envíos"],
          ["business", "Negocio e insumos"],
          ["team", "Equipo y actividad"],
          ["backup", "Respaldos"],
        ].map(([id, label]) => (
          <button
            className={tab === id ? "active" : ""}
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "cash" ? (
        <CashPanel {...props} />
      ) : tab === "catalog" ? (
        <CatalogAdmin {...props} />
      ) : tab === "delivery" ? (
        <DeliveryPanel {...props} />
      ) : tab === "business" ? (
        <BusinessPanel {...props} />
      ) : tab === "team" ? (
        <TeamPanel {...props} />
      ) : (
        <BackupPanel {...props} />
      )}
    </main>
  );
}
