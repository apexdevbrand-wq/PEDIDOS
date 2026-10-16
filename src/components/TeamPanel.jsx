import React, { useState, useEffect } from "react";
import { api } from "../api";
import Modal from "./Modal";
const actions = {
  "session.login": "Inicio de sesión",
  "session.logout": "Cierre de sesión",
  "user.created": "Usuario creado",
  "user.updated": "Usuario actualizado",
  "order.created": "Pedido creado",
  "order.updated": "Pedido actualizado",
  "product.updated": "Producto modificado",
  "product.options.updated": "Opciones modificadas",
  "settings.updated": "Operación modificada",
  "ingredient.updated": "Insumo actualizado",
  "ingredient.created": "Insumo agregado",
  "cash.closed": "Caja cerrada",
  "orders.paused": "Recepción pausada/reanudada",
  "backup.created": "Respaldo creado",
  "zone.updated": "Colonia actualizada",
  "zone.created": "Colonia agregada",
};
export default function TeamPanel({ run }) {
  const [users, setUsers] = useState([]),
    [audit, setAudit] = useState([]),
    [editing, setEditing] = useState(null),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState({
      username: "",
      displayName: "",
      password: "",
      role: "staff",
    });
  async function load() {
    const [u, a] = await Promise.all([
      api("/staff/users"),
      api("/staff/audit"),
    ]);
    setUsers(u);
    setAudit(a);
  }
  useEffect(() => {
    run(load);
  }, []);
  async function updateUser(id, body) {
    await run(async () => {
      await api("/staff/users/" + id, "PATCH", body);
      await load();
    });
  }
  return (
    <div className="admin-grid">
      <section className="panel">
        <div className="line">
          <h2>Equipo y accesos</h2>
          <button
            className="secondary"
            onClick={() => {
              setDraft({
                username: "",
                displayName: "",
                password: "",
                role: "staff",
              });
              setEditing({ create: true });
            }}
          >
            + Nuevo usuario
          </button>
        </div>
        <p className="muted">
          Cocina solo ve pedidos. Dueño también administra el negocio. Cada
          persona debe usar su cuenta.
        </p>
        {users.map((u) => (
          <div className="user-card" key={u.id}>
            <div className="line">
              <div>
                <b>{u.displayName}</b>
                <small>
                  @{u.username} · {u.active ? "Activo" : "Inactivo"}
                </small>
              </div>
              <span className="badge">
                {u.role === "owner" ? "Dueño" : "Cocina"}
              </span>
            </div>
            <div className="user-actions">
              <label>
                Permisos
                <select
                  aria-label={"Permisos de " + u.username}
                  value={u.role}
                  onChange={(e) => updateUser(u.id, { role: e.target.value })}
                >
                  <option value="staff">Cocina</option>
                  <option value="owner">Dueño</option>
                </select>
              </label>
              <button
                className="text-button"
                onClick={() => {
                  setPassword("");
                  setEditing({ user: u });
                }}
              >
                Cambiar contraseña
              </button>
              <button
                className={u.active ? "danger-link" : "text-button"}
                onClick={() => updateUser(u.id, { active: !u.active })}
              >
                {u.active ? "Desactivar" : "Activar"}
              </button>
            </div>
          </div>
        ))}
      </section>
      <section className="panel">
        <div className="line">
          <h2>Registro de actividad</h2>
          <button className="text-button" onClick={() => run(load)}>
            Actualizar
          </button>
        </div>
        <p className="muted">
          Últimos 200 movimientos. Las contraseñas no se registran.
        </p>
        <div className="audit-list">
          {audit.map((a) => (
            <article key={a.id}>
              <b>{actions[a.action] || a.action}</b>
              <p>
                {a.actor}
                {a.details.folio ? " · " + a.details.folio : ""}
                {a.details.status
                  ? " · " +
                    ({
                      cooking: "En cocina",
                      ready: "Listo / En camino",
                      rejected: "Rechazado",
                      completed: "Entregado",
                    }[a.details.status] || a.details.status)
                  : ""}
              </p>
              {a.details.rejectionReason && <p>{a.details.rejectionReason}</p>}
              <small>{new Date(a.created_at).toLocaleString("es-MX")}</small>
            </article>
          ))}
        </div>
      </section>
      {editing && (
        <Modal
          title={
            editing.create
              ? "Crear usuario"
              : "Cambiar contraseña de " + editing.user.username
          }
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const result = await run(async () => {
                const u = editing.create
                  ? await api("/staff/users", "POST", draft)
                  : await api("/staff/users/" + editing.user.id, "PATCH", {
                      password,
                    });
                await load();
                return u;
              });
              setBusy(false);
              if (result) {
                setEditing(null);
                setPassword("");
                setDraft({
                  username: "",
                  displayName: "",
                  password: "",
                  role: "staff",
                });
              }
            }}
          >
            {editing.create ? (
              <>
                <label>
                  Nombre visible
                  <input
                    required
                    maxLength={80}
                    value={draft.displayName}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, displayName: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Nombre de usuario
                  <input
                    required
                    minLength={3}
                    maxLength={40}
                    pattern="[a-z0-9._-]{3,40}"
                    value={draft.username}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        username: e.target.value.toLowerCase(),
                      }))
                    }
                    placeholder="ana.cocina"
                  />
                </label>
                <label>
                  Permisos
                  <select
                    value={draft.role}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, role: e.target.value }))
                    }
                  >
                    <option value="staff">Solo Cocina</option>
                    <option value="owner">Cocina y Administración</option>
                  </select>
                </label>
                <label>
                  Contraseña
                  <input
                    required
                    autoComplete="new-password"
                    type="password"
                    minLength={12}
                    maxLength={256}
                    value={draft.password}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, password: e.target.value }))
                    }
                  />
                </label>
              </>
            ) : (
              <label>
                Nueva contraseña
                <input
                  required
                  autoComplete="new-password"
                  type="password"
                  minLength={12}
                  maxLength={256}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            <p className="muted">
              Mínimo 12 caracteres. Cambiar permisos, disponibilidad o
              contraseña cierra las sesiones de esa persona. No se puede
              desactivar al último dueño.
            </p>
            <button className="primary full" disabled={busy}>
              {busy ? "Guardando…" : "Guardar usuario"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
