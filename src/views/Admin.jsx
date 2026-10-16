import React, { useState } from "react";
import CashPanel from "../components/CashPanel";
import MenuAdmin from "../components/MenuAdmin";
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
      <div className="section-title">
        <div>
          <span className="eyebrow">TODO BAJO CONTROL</span>
          <h1>
            Tu negocio, al día<span className="dot">.</span>
          </h1>
          <p className="muted">Operación, equipo y finanzas de Los Santos.</p>
        </div>
        <span className="badge">Acceso de dueño</span>
      </div>
      <nav className="admin-tabs" aria-label="Secciones de administración">
        {[
          ["cash", "Ventas y caja"],
          ["menu", "Menú y colonias"],
          ["business", "Horarios e insumos"],
          ["team", "Equipo y actividad"],
          ["backup", "Respaldos"],
        ].map(([id, label]) => (
          <button
            className={tab === id ? "active" : ""}
            key={id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "cash" ? (
        <CashPanel {...props} />
      ) : tab === "menu" ? (
        <MenuAdmin {...props} />
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
