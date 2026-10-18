import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Flame, UtensilsCrossed, LayoutDashboard } from "lucide-react";
import "@fontsource/anton/latin.css";
import "@fontsource-variable/rubik/wght.css";
import "@fontsource/dm-serif-display/latin-400.css";
import "@fontsource/dm-serif-display/latin-400-italic.css";
import { api } from "./api";
import Shop from "./views/Shop";
import Kitchen from "./views/Kitchen";
import Admin from "./views/Admin";
import Mascot from "./components/Mascot";
import "./style.css";
// Retire the old shared browser credential; authorization now lives in an HttpOnly session.
sessionStorage.removeItem("staffToken");
const personal = /^\/personal\/?$/.test(location.pathname);
function App() {
  const [view, setView] = useState("shop"),
    [role, setRole] = useState("customer"),
    [catalog, setCatalog] = useState({ products: [], zones: [] }),
    [orders, setOrders] = useState([]),
    [error, setError] = useState(""),
    [tracking, setTracking] = useState(null),
    [connected, setConnected] = useState(false),
    [key, setKey] = useState(""),
    [username, setUsername] = useState(""),
    [user, setUser] = useState(null),
    [loginError, setLoginError] = useState(""),
    [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  // Android/Chrome: botón para instalar la tienda como app en el teléfono.
  const [install, setInstall] = useState(null);
  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setInstall(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setInstall(null));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  async function promptInstall() {
    install?.prompt();
    await install?.userChoice.catch(() => {});
    setInstall(null);
  }
  const staff = role === "staff" || role === "owner";
  const safeView =
    role === "customer"
      ? "shop"
      : role === "owner" && view === "admin"
        ? "admin"
        : "kitchen";
  function changeRole(next, actor = null) {
    setUser(actor);
    epoch.current++;
    setRole(next);
    setView(next === "customer" ? "shop" : "kitchen");
    setOrders([]);
    setError("");
  }
  useEffect(() => {
    if (!personal) return;
    const version = epoch.current;
    api("/auth/session")
      .then((s) => {
        if (version === epoch.current && s.role !== "customer")
          changeRole(s.role, s.user);
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
        const nextOrders = await api("/staff/orders?recent=1");
        if (version !== epoch.current) return;
        setOrders(nextOrders);
      } else if (!personal) {
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
    // Tiempo real: WebSocket en Cloudflare (/api/live) o, si no existe,
    // EventSource en el servidor Node (/api/events). Reconecta solo.
    let closed = false,
      socket = null,
      source = null,
      retry = null,
      ping = null,
      poll = null,
      opened = false,
      attempts = 0;
    const onOpen = () => {
      setConnected(true);
      if (opened) refresh();
      opened = true;
      attempts = 0;
    };
    const useEventSource = () => {
      source = new EventSource("/api/events");
      source.onopen = onOpen;
      source.onerror = () => setConnected(false);
      source.onmessage = () => refresh();
    };
    const connect = () => {
      if (closed) return;
      const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/live");
      let wasOpen = false;
      socket = ws;
      ws.onopen = () => {
        wasOpen = true;
        onOpen();
        clearInterval(ping);
        ping = setInterval(() => ws.readyState === 1 && ws.send("ping"), 30000);
        // Horarios y pausas que vencen: se revisa el catálogo cada minuto.
        clearInterval(poll);
        poll = setInterval(() => document.visibilityState === "visible" && refresh(), 60000);
      };
      ws.onmessage = (e) => e.data === "update" && refresh();
      ws.onclose = () => {
        setConnected(false);
        clearInterval(ping);
        if (closed) return;
        if (!wasOpen && !opened && attempts >= 1) return useEventSource();
        attempts++;
        retry = setTimeout(connect, Math.min(15000, 1000 * 2 ** Math.min(attempts, 4)));
      };
    };
    connect();
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      if (socket && socket.readyState > 1) {
        clearTimeout(retry);
        connect();
      }
      refresh();
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(ping);
      clearInterval(poll);
      socket?.close();
      source?.close();
      document.removeEventListener("visibilitychange", wake);
    };
  }, [safeView, role]);
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
      const result = await api(path, "PATCH", body);
      await refresh();
      return result;
    });
  async function login(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setLoginError("");
    try {
      const session = await api("/auth/login", "POST", {
        username,
        password: key,
      });
      changeRole(session.role, session.user);
      setKey("");
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
    : personal
      ? []
      : [["shop", "Ordenar", UtensilsCrossed]];
  const loginForm = (
    <form onSubmit={login}>
      <h2 id="login-title">Entrada del equipo</h2>
      <p className="muted">
        Cocina y administración. Usa la cuenta que te dio el dueño.
      </p>
      <label>
        Usuario
        <input
          required
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={40}
        />
      </label>
      <label>
        Contraseña
        <input
          required
          autoComplete="current-password"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          maxLength={256}
        />
      </label>
      {loginError && (
        <p role="alert" className="notice">
          {loginError}
        </p>
      )}
      <div className="login-actions">
        <a href="/">Volver al catálogo</a>
        <button className="primary" disabled={busy}>
          {busy ? "Verificando…" : "Iniciar sesión"}
        </button>
      </div>
    </form>
  );
  return (
    <>
      <header className={staff || personal ? "topbar topbar-staff" : "topbar"}>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            if (staff) {
              e.preventDefault();
              setView("kitchen");
            }
          }}
        >
          <img
            src="/brand/logo-white.png"
            alt="Los Santos · Drinks, snacks & más"
            width="900"
            height="504"
          />
        </a>
        {navigation.length > 1 && (
          <nav aria-label="Módulos disponibles">
            {navigation.map(([id, name, Icon]) => (
              <button
                className={id === safeView ? "selected" : ""}
                aria-current={id === safeView ? "page" : undefined}
                onClick={() => {
                  setError("");
                  setView(id);
                }}
                key={id}
              >
                <Icon size={16} aria-hidden="true" />
                {name}
              </button>
            ))}
          </nav>
        )}
        {staff ? (
          <div className="session-controls">
            <span>
              {user?.displayName ||
                (role === "owner" ? "Dueño" : "Cocina")}
            </span>
            <button onClick={logout}>Cerrar sesión</button>
          </div>
        ) : (
          !personal && (
            <div className="topbar-end">
              {install && (
                <button className="install-app" onClick={promptInstall}>
                  Instalar app
                </button>
              )}
              {catalog.settings?.instagram && (
                <a
                  className="topbar-social"
                  href={"https://instagram.com/" + catalog.settings.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  @{catalog.settings.instagram}
                </a>
              )}
            </div>
          )
        )}
      </header>
      {error && (
        <div role="alert" className="error">
          {error}
          <button onClick={() => setError("")}>Cerrar</button>
        </div>
      )}
      {personal && !staff ? (
        <main className="personal-login">
          <section className="personal-card">{loginForm}</section>
        </main>
      ) : safeView === "shop" ? (
        <Shop
          catalog={catalog}
          run={run}
          tracking={tracking}
          setTracking={setTracking}
        />
      ) : safeView === "kitchen" && staff ? (
        <Kitchen
          orders={orders}
          update={update}
          connected={connected}
          catalog={catalog}
          run={run}
          refresh={refresh}
        />
      ) : role === "owner" ? (
        <Admin
          catalog={catalog}
          orders={orders}
          update={update}
          run={run}
          refresh={refresh}
        />
      ) : null}
      {!staff && !personal && (
        <footer className="site-footer">
          <img
            src="/brand/logo-white.png"
            alt="Los Santos"
            width="160"
            height="88"
            loading="lazy"
          />
          <div>
            {catalog.settings?.address && <p>{catalog.settings.address}</p>}
            {catalog.settings?.publicPhone && (
              <p>
                <a href={"tel:+" + (catalog.settings.countryCode || "52") + catalog.settings.publicPhone}>
                  Llámanos: {catalog.settings.publicPhone}
                </a>
              </p>
            )}
            <p className="footer-links">
              {catalog.settings?.facebook && (
                <a href={catalog.settings.facebook} target="_blank" rel="noopener noreferrer">
                  Facebook
                </a>
              )}
              {catalog.settings?.instagram && (
                <a href={"https://instagram.com/" + catalog.settings.instagram} target="_blank" rel="noopener noreferrer">
                  Instagram
                </a>
              )}
              {catalog.settings?.tiktok && (
                <a href={"https://www.tiktok.com/@" + catalog.settings.tiktok} target="_blank" rel="noopener noreferrer">
                  TikTok
                </a>
              )}
            </p>
          </div>
          <div className="footer-end">
            <div className="footer-mascots" aria-hidden="true">
              <Mascot kind="devil" pose="fiesta" tone="#fff" fill="#e10a0a" />
              <Mascot kind="angel" pose="fiesta" fill="#e10a0a" />
            </div>
            <small>
              Precios en pesos mexicanos. Las fotos son ilustrativas. En iPhone: Compartir →
              “Agregar a inicio” para tenerla como app.
            </small>
          </div>
        </footer>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
const tracked = new URLSearchParams(location.search).get("order");
if (tracked && /^[a-f0-9-]{36}$/i.test(tracked))
  localStorage.setItem("tracking", tracked);
if (window.isSecureContext && "serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
