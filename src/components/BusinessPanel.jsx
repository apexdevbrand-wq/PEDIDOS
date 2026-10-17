import React, { useState, useEffect } from "react";
import { api } from "../api";
export default function BusinessPanel({ catalog, run, refresh }) {
  const [draft, setDraft] = useState(() => structuredClone(catalog.settings)),
    [ingredients, setIngredients] = useState([]),
    [name, setName] = useState(""),
    [saved, setSaved] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setIngredients(await api("/staff/ingredients"));
  }
  useEffect(() => {
    run(load);
  }, []);
  const change = (key, val) => {
    setDraft((s) => ({ ...s, [key]: val }));
    setSaved("");
  };
  return (
    <div className="admin-grid">
      <section className="panel">
        <h2>Datos del negocio y horario</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const result = await run(async () => {
              const settings = await api("/staff/settings", "PATCH", draft);
              await refresh();
              return settings;
            });
            setBusy(false);
            if (result) {
              setDraft(result);
              setSaved("Configuración guardada.");
            }
          }}
        >
          <label>
            Nombre del negocio
            <input
              required
              maxLength={80}
              value={draft.businessName}
              onChange={(e) => change("businessName", e.target.value)}
            />
          </label>
          <fieldset className="public-profile">
            <legend>Pago por transferencia</legend>
            <p className="muted">
              Con banco, titular y CLABE o cuenta capturados, el cliente puede elegir
              transferencia: verá estos datos y un botón para mandar su comprobante por
              WhatsApp. Cocina confirma el pago antes de preparar.
            </p>
            <div className="form-columns">
              <label>
                Banco
                <input
                  maxLength={80}
                  value={draft.transferBank || ""}
                  onChange={(e) => change("transferBank", e.target.value)}
                  placeholder="Ej. BBVA"
                />
              </label>
              <label>
                Titular
                <input
                  maxLength={80}
                  value={draft.transferHolder || ""}
                  onChange={(e) => change("transferHolder", e.target.value)}
                />
              </label>
            </div>
            <div className="form-columns">
              <label>
                CLABE (18 dígitos)
                <input
                  inputMode="numeric"
                  pattern="[0-9]{18}"
                  value={draft.transferClabe || ""}
                  onChange={(e) => change("transferClabe", e.target.value.replace(/\D/g, "").slice(0, 18))}
                />
              </label>
              <label>
                Cuenta o tarjeta (opcional)
                <input
                  inputMode="numeric"
                  pattern="[0-9]{10,19}"
                  value={draft.transferAccount || ""}
                  onChange={(e) => change("transferAccount", e.target.value.replace(/\D/g, "").slice(0, 19))}
                />
              </label>
            </div>
            <label>
              WhatsApp para recibir comprobantes (10 dígitos)
              <input
                inputMode="numeric"
                pattern="[0-9]{10,15}"
                value={draft.receiptWhatsapp || ""}
                onChange={(e) => change("receiptWhatsapp", e.target.value.replace(/\D/g, ""))}
              />
            </label>
          </fieldset>
          <fieldset className="public-profile">
            <legend>Lo que ve el cliente</legend>
            <label>
              Frase de la portada
              <input
                maxLength={160}
                value={draft.tagline || ""}
                onChange={(e) => change("tagline", e.target.value)}
              />
            </label>
            <label>
              Dirección
              <input
                maxLength={160}
                value={draft.address || ""}
                onChange={(e) => change("address", e.target.value)}
              />
            </label>
            <div className="form-columns">
              <label>
                Teléfono público (opcional)
                <input
                  inputMode="numeric"
                  pattern="[0-9]{10,15}"
                  value={draft.publicPhone || ""}
                  onChange={(e) => change("publicPhone", e.target.value.replace(/\D/g, ""))}
                />
              </label>
              <label>
                Instagram (usuario)
                <input
                  value={draft.instagram || ""}
                  onChange={(e) => change("instagram", e.target.value.replace(/^@/, "").trim())}
                />
              </label>
            </div>
            <div className="form-columns">
              <label>
                TikTok (usuario)
                <input
                  value={draft.tiktok || ""}
                  onChange={(e) => change("tiktok", e.target.value.replace(/^@/, "").trim())}
                />
              </label>
              <label>
                Página de Facebook
                <input
                  type="url"
                  value={draft.facebook || ""}
                  onChange={(e) => change("facebook", e.target.value.trim())}
                />
              </label>
            </div>
          </fieldset>
          <div className="form-columns">
            <label>
              Tiempo estimado habitual (min)
              <input
                required
                type="number"
                min="1"
                max="240"
                value={draft.defaultPrepMinutes}
                onChange={(e) =>
                  change("defaultPrepMinutes", Number(e.target.value))
                }
              />
            </label>
            <label>
              Código de país para WhatsApp
              <input
                required
                pattern="[0-9]{1,3}"
                value={draft.countryCode}
                onChange={(e) => change("countryCode", e.target.value)}
              />
            </label>
          </div>
          <label>
            Zona horaria
            <select
              value={draft.timezone}
              onChange={(e) => change("timezone", e.target.value)}
            >
              {[
                "America/Mexico_City",
                "America/Cancun",
                "America/Tijuana",
                "America/Hermosillo",
                "America/Monterrey",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={draft.manualClosed}
              onChange={(e) => change("manualClosed", e.target.checked)}
            />
            Cerrar recepción manualmente
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={draft.scheduleEnabled}
              onChange={(e) => change("scheduleEnabled", e.target.checked)}
            />
            Aplicar horario semanal
          </label>
          <p className="muted">
            Si la hora de cierre es menor que la de apertura, el turno termina
            al día siguiente.
          </p>
          <div className="hours-table">
            {[
              [1, "Lunes"],
              [2, "Martes"],
              [3, "Miércoles"],
              [4, "Jueves"],
              [5, "Viernes"],
              [6, "Sábado"],
              [0, "Domingo"],
            ].map(([index, label]) => (
              <div className="hours-row" key={index}>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={draft.hours[index].enabled}
                    onChange={(e) =>
                      change(
                        "hours",
                        draft.hours.map((h, i) =>
                          i === index ? { ...h, enabled: e.target.checked } : h,
                        ),
                      )
                    }
                  />
                  {label}
                </label>
                <input
                  aria-label={"Abre " + label}
                  type="time"
                  required
                  disabled={!draft.hours[index].enabled}
                  value={draft.hours[index].open}
                  onChange={(e) =>
                    change(
                      "hours",
                      draft.hours.map((h, i) =>
                        i === index ? { ...h, open: e.target.value } : h,
                      ),
                    )
                  }
                />
                <span>→</span>
                <input
                  aria-label={"Cierra " + label}
                  type="time"
                  required
                  disabled={!draft.hours[index].enabled}
                  value={draft.hours[index].close}
                  onChange={(e) =>
                    change(
                      "hours",
                      draft.hours.map((h, i) =>
                        i === index ? { ...h, close: e.target.value } : h,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
          <label>
            Mensaje durante la pausa
            <textarea
              maxLength={300}
              value={draft.pauseReason}
              onChange={(e) => change("pauseReason", e.target.value)}
            />
          </label>
          <button className="primary full" disabled={busy}>
            {busy ? "Guardando…" : "Guardar horario y operación"}
          </button>
          {saved && (
            <p className="success" role="status">
              {saved}
            </p>
          )}
        </form>
        <div className="pause-actions">
          <button
            className="secondary"
            onClick={() =>
              run(async () => {
                await api("/staff/pause", "POST", { minutes: 20 });
                await refresh();
              })
            }
          >
            Pausar 20 minutos
          </button>
          <button
            className="secondary"
            onClick={() =>
              run(async () => {
                await api("/staff/pause", "POST", { minutes: 0 });
                await refresh();
              })
            }
          >
            Quitar pausa
          </button>
        </div>
        {catalog.availability && !catalog.availability.open && (
          <p className="notice">{catalog.availability.reason}</p>
        )}
      </section>
      <section className="panel">
        <h2>Insumos disponibles</h2>
        <p className="muted">
          Al marcar un insumo como agotado se bloquean los platillos y extras
          vinculados. Configura sus relaciones en Catálogo → Opciones de cada producto.
        </p>
        {ingredients.map((i) => (
          <div className="ingredient-row" key={i.id}>
            <div>
              <b>{i.name}</b>
              <small>{i.available ? "Disponible" : "Agotado"}</small>
            </div>
            <button
              className={"toggle " + (i.available ? "on" : "")}
              role="switch"
              aria-checked={i.available}
              aria-label={"Insumo " + i.name}
              onClick={() =>
                run(async () => {
                  await api("/staff/ingredients/" + i.id, "PATCH", {
                    available: !i.available,
                  });
                  await load();
                  await refresh();
                })
              }
            >
              <span />
            </button>
          </div>
        ))}
        <form
          className="add-ingredient"
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await run(async () => {
              const i = await api("/staff/ingredients", "POST", { name });
              await load();
              return i;
            });
            if (result) setName("");
          }}
        >
          <input
            required
            maxLength={80}
            placeholder="Nuevo insumo"
            aria-label="Nuevo insumo"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="primary">Agregar</button>
        </form>
      </section>
    </div>
  );
}
