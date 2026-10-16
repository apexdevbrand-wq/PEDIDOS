import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Flame, UtensilsCrossed, LayoutDashboard } from "lucide-react";
import { api } from "./api";
import Shop from "./views/Shop";
import Kitchen from "./views/Kitchen";
import Admin from "./views/Admin";
import "./style.css";
// Retire the old shared browser credential; authorization now lives in an HttpOnly session.
sessionStorage.removeItem("staffToken");
function App() {
  const [view, setView] = useState("shop"),
    [role, setRole] = useState("customer"),
    [catalog, setCatalog] = useState({ products: [], zones: [] }),
    [orders, setOrders] = useState([]),
    [error, setError] = useState(""),
    [tracking, setTracking] = useState(null),
    [connected, setConnected] = useState(false),
    [loginOpen, setLoginOpen] = useState(false),
    [key, setKey] = useState(""),
    [loginError, setLoginError] = useState(""),
    [busy, setBusy] = useState(false);
  const epoch = useRef(0),
    dialog = useRef(null);
  const staff = role === "staff" || role === "owner";
  const safeView =
    role === "customer"
      ? "shop"
      : role === "owner" && view === "admin"
        ? "admin"
        : "kitchen";
  function changeRole(next) {
    epoch.current++;
    setRole(next);
    setView(next === "customer" ? "shop" : "kitchen");
    setOrders([]);
    setError("");
  }
  useEffect(() => {
    const version = epoch.current;
    api("/auth/session")
      .then((s) => {
        if (version === epoch.current && s.role !== "customer") changeRole(s.role);
      })
      .catch(() => {});
  }, []);
  async function refresh() {
    const version = epoch.current;
    try {
      const nextCatalog = await api("/catalog");
      if (version !== epoch.current) return;
      setCatalog(nextCatalog);
      if (staff) {
        const nextOrders = await api("/staff/orders");
        if (version !== epoch.current) return;
        setOrders(nextOrders);
      } else {
        const id = localStorage.getItem("tracking");
        if (id) {
          const order = await api("/orders/" + id);
          if (version === epoch.current) setTracking(order);
        }
      }
    } catch (e) {
      if (version !== epoch.current) return;
      if (e.status === 401 && staff) changeRole("customer");
      setError(e.message);
    }
  }
  useEffect(() => {
    refresh();
    const source = new EventSource("/api/events");
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = () => refresh();
    return () => source.close();
  }, [safeView, role]);
  useEffect(() => {
    if (loginOpen) {
      dialog.current?.showModal();
    } else if (dialog.current?.open) dialog.current.close();
  }, [loginOpen]);
  async function run(fn) {
    setError("");
    try {
      return await fn();
    } catch (e) {
      if (e.status === 401 && staff) changeRole("customer");
      setError(e.message);
      return null;
    }
  }
  const update = (path, body) =>
    run(async () => {
      await api(path, "PATCH", body);
      await refresh();
    });
  async function login(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setLoginError("");
    try {
      const session = await api("/auth/login", "POST", { token: key });
      changeRole(session.role);
      setKey("");
      setLoginOpen(false);
    } catch (e) {
      setLoginError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await run(async () => {
      await api("/auth/logout", "POST", {});
      changeRole("customer");
      setTracking(null);
    });
  }
  const navigation = staff
    ? [
        ["kitchen", "Cocina", Flame],
        ...(role === "owner"
          ? [["admin", "Administración", LayoutDashboard]]
          : []),
      ]
    : [["shop", "Ordenar", UtensilsCrossed]];
  return (
    <>
      <header>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView(staff ? "kitchen" : "shop");
          }}
        >
          <span className="halo">◒</span>
          <span>
            <b>Los Santos.</b>
            <small>DRINKS, SNACKS & MÁS</small>
          </span>
        </a>
        <nav aria-label="Módulos disponibles">
          {navigation.map(([id, name, Icon]) => (
            <button
              className={id === safeView ? "selected" : ""}
              onClick={() => {
                setError("");
                setView(id);
              }}
              key={id}
            >
              <Icon size={16} />
              {name}
            </button>
          ))}
        </nav>
        {staff ? (
          <div className="session-controls">
            <span>{role === "owner" ? "Dueño" : "Staff de cocina"}</span>
            <button onClick={logout}>Cerrar sesión</button>
          </div>
        ) : (
          <span className="open">
            <i />
            Hecho al momento
          </span>
        )}
      </header>
      {error && (
        <div role="alert" className="error">
          {error}
          <button onClick={() => setError("")}>Cerrar</button>
        </div>
      )}
      {safeView === "shop" ? (
        <Shop
          catalog={catalog}
          run={run}
          tracking={tracking}
          setTracking={setTracking}
        />
      ) : safeView === "kitchen" && staff ? (
        <Kitchen orders={orders} update={update} connected={connected} />
      ) : role === "owner" ? (
        <Admin
          catalog={catalog}
          orders={orders}
          update={update}
          run={run}
          refresh={refresh}
        />
      ) : null}
      <footer>
        <b>Los Santos.</b>
        <span>El punto de encuentro de tus antojos.</span>
        {!staff && (
          <button
            className="staff-entry"
            onClick={() => {
              setLoginError("");
              setKey("");
              setLoginOpen(true);
            }}
          >
            Acceso de personal
          </button>
        )}
        <small>PRECIOS EN MXN · IMÁGENES ILUSTRATIVAS</small>
      </footer>
      <dialog
        ref={dialog}
        className="login-dialog"
        aria-labelledby="login-title"
        onCancel={() => setLoginOpen(false)}
      >
        <form onSubmit={login}>
          <span className="eyebrow">ACCESO RESTRINGIDO</span>
          <h2 id="login-title">Personal de Los Santos</h2>
          <p className="muted">
            Ingresa tu clave de cocina o de dueño. Tus permisos se validan en el
            servidor.
          </p>
          <label>
            Clave de acceso
            <input
              autoFocus
              required
              autoComplete="current-password"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              maxLength={512}
            />
          </label>
          {loginError && (
            <p role="alert" className="notice">
              {loginError}
            </p>
          )}
          <div className="login-actions">
            <button
              type="button"
              onClick={() => {
                setKey("");
                setLoginOpen(false);
              }}
            >
              Cancelar
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Verificando…" : "Iniciar sesión"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
if (import.meta.env.PROD && "serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
