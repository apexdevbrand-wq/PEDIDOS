import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Flame, UtensilsCrossed, LayoutDashboard } from "lucide-react";
import { api } from "./api";
import Shop from "./views/Shop";
import Kitchen from "./views/Kitchen";
import Admin from "./views/Admin";
import "./style.css";
function App() {
  const [view, setView] = useState("shop"),
    [catalog, setCatalog] = useState({ products: [], zones: [] }),
    [orders, setOrders] = useState([]),
    [error, setError] = useState(""),
    [token, setToken] = useState(sessionStorage.getItem("staffToken") || ""),
    [tracking, setTracking] = useState(null),
    [connected, setConnected] = useState(false);
  async function refresh() {
    try {
      setCatalog(await api("/catalog"));
      if (view !== "shop") setOrders(await api("/staff/orders"));
      const id = localStorage.getItem("tracking");
      if (id) setTracking(await api("/orders/" + id));
    } catch (e) {
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
  }, [view]);
  async function run(fn) {
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
      return null;
    }
  }
  const update = (path, body) =>
    run(async () => {
      await api(path, "PATCH", body);
      await refresh();
    });
  return (
    <>
      <header>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("shop");
          }}
        >
          <span className="halo">◒</span>
          <span>
            <b>Los Santos.</b>
            <small>DRINKS, SNACKS & MÁS</small>
          </span>
        </a>
        <nav>
          {[
            ["shop", "Ordenar", UtensilsCrossed],
            ["kitchen", "Cocina", Flame],
            ["admin", "Administración", LayoutDashboard],
          ].map(([id, name, Icon]) => (
            <button
              className={id === view ? "selected" : ""}
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
        <span className="open">
          <i /> Hecho al momento
        </span>
      </header>
      {catalog.demo && (
        <div className="demo">
          DEMO LOCAL · Acceso de personal abierto en desarrollo · Menú y tarifas
          de ejemplo
        </div>
      )}
      {error && (
        <div role="alert" className="error">
          {error}
          <button onClick={() => setError("")}>Cerrar</button>
        </div>
      )}
      {view !== "shop" && !catalog.demo && (
        <div className="staff">
          <label>
            Token del personal
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <button
            className="primary"
            onClick={() => {
              sessionStorage.setItem("staffToken", token);
              refresh();
            }}
          >
            Acceder
          </button>
        </div>
      )}
      {view === "shop" ? (
        <Shop
          catalog={catalog}
          run={run}
          tracking={tracking}
          setTracking={setTracking}
        />
      ) : view === "kitchen" ? (
        <Kitchen orders={orders} update={update} connected={connected} />
      ) : (
        <Admin
          catalog={catalog}
          orders={orders}
          update={update}
          run={run}
          refresh={refresh}
        />
      )}
      <footer>
        <b>Los Santos.</b>
        <span>El punto de encuentro de tus antojos.</span>
        <small>PRECIOS EN MXN · IMÁGENES ILUSTRATIVAS</small>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
if (import.meta.env.PROD && "serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
