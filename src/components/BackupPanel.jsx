import React, { useState, useEffect } from "react";
import { api } from "../api";
export default function BackupPanel({ run }) {
  const [backups, setBackups] = useState([]),
    [offsite, setOffsite] = useState(null),
    [shipping, setShipping] = useState(false),
    [restoring, setRestoring] = useState(false),
    [busy, setBusy] = useState(false);
  async function load() {
    const [list, remote] = await Promise.all([api("/staff/backups"), api("/staff/backups-offsite")]);
    setBackups(list);
    setOffsite(remote);
  }
  useEffect(() => {
    run(load);
  }, []);
  return (
    <div className="admin-grid">
      <section className="panel">
        <div className="line">
          <h2>Respaldos de seguridad</h2>
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await run(async () => {
                await api("/staff/backups", "POST", {});
                await load();
              });
              setBusy(false);
            }}
          >
            {busy ? "Respaldando…" : "Crear respaldo ahora"}
          </button>
        </div>
        <p className="muted">
          {offsite?.platform === "cloudflare"
            ? "Respaldo automático cada 6 horas. Se conservan los últimos 28 automáticos (7 días); los manuales no se borran solos."
            : "Respaldo al iniciar, antes de actualizar y cada 6 horas mientras el servidor esté encendido. Se conservan los últimos 56 automáticos; los manuales no se eliminan automáticamente."}
        </p>
        {offsite && (
          <div className={"offsite " + (offsite.configured ? (offsite.lastError ? "is-bad" : "is-ok") : "is-off")}>
            <b>Copia fuera del servidor</b>
            {!offsite.configured ? (
              <p>
                Sin configurar. Conecta un almacenamiento gratuito (Cloudflare R2 o Backblaze
                B2) con las variables BACKUP_S3_* para que cada respaldo y cada foto se copien
                solos.
              </p>
            ) : (
              <>
                <p>
                  {offsite.lastOkAt
                    ? "Última copia correcta: " + new Date(offsite.lastOkAt).toLocaleString("es-MX")
                    : "Aún no se ha enviado ninguna copia."}
                  {offsite.photos ? ` · ${offsite.photos} foto(s) resguardadas` : ""}
                </p>
                {offsite.lastError && (
                  <p className="stock-warning">
                    Último error ({new Date(offsite.lastErrorAt).toLocaleString("es-MX")}): {offsite.lastError}
                  </p>
                )}
                <button
                  className="secondary"
                  disabled={shipping}
                  onClick={async () => {
                    setShipping(true);
                    await run(async () => {
                      await api("/staff/backups-offsite", "POST", {});
                      await load();
                    });
                    setShipping(false);
                  }}
                >
                  {shipping ? "Enviando…" : "Respaldar y enviar ahora"}
                </button>
              </>
            )}
          </div>
        )}
        <p className="notice">
          Descarga periódicamente un respaldo a otro dispositivo. La copia
          contiene datos de clientes y credenciales protegidas: guárdala en un
          lugar privado.
        </p>
        {backups.slice(0, 30).map((b) => (
          <div className="backup-row" key={b.name}>
            <div>
              <b>{new Date(b.createdAt).toLocaleString("es-MX")}</b>
              <small>
                {b.name.startsWith("manual")
                  ? "Manual"
                  : b.name.startsWith("pre-upgrade")
                    ? "Antes de actualizar"
                    : "Automático"}{" "}
                · {Math.ceil(b.size / 1024)} KB
              </small>
            </div>
            <a
              className="text-button"
              href={"/api/staff/backups/" + encodeURIComponent(b.name)}
            >
              Descargar
            </a>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Recuperar un respaldo</h2>
        {offsite?.platform === "cloudflare" ? (
          <>
            <ol className="restore-steps">
              <li>Descarga antes un respaldo actual (botón de arriba) por si te arrepientes.</li>
              <li>Elige el archivo <b>.json</b> que quieres recuperar.</li>
              <li>
                Se reemplazan pedidos, usuarios, menú y configuración. Todos tendrán que iniciar
                sesión de nuevo.
              </li>
            </ol>
            <label className="secondary file-button">
              {restoring ? "Restaurando…" : "Elegir respaldo .json y restaurar"}
              <input
                type="file"
                accept="application/json,.json"
                disabled={restoring}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (!window.confirm("¿Restaurar " + file.name + "? Se reemplazará la información actual."))
                    return;
                  setRestoring(true);
                  const ok = await run(async () => {
                    const r = await fetch("/api/staff/backups/restore", {
                      method: "POST",
                      headers: { "Content-Type": "application/octet-stream" },
                      body: file,
                    });
                    const b = await r.json().catch(() => ({}));
                    if (!r.ok) throw Error(b.error || "No se pudo restaurar");
                    return true;
                  });
                  setRestoring(false);
                  if (ok) {
                    alert("Respaldo restaurado. Inicia sesión de nuevo.");
                    location.assign("/personal");
                  }
                }}
              />
            </label>
            <p className="muted">
              Las fotos subidas se conservan. Cloudflare además guarda automáticamente el historial
              de los últimos 30 días.
            </p>
          </>
        ) : (
          <>
        <ol className="restore-steps">
            <li>
              Detén el servidor en su terminal con <b>Ctrl+C</b>.
            </li>
            <li>
              Guarda el archivo descargado en una carpeta privada de tu
              computadora.
            </li>
            <li>
              Desde la carpeta del proyecto ejecuta:
              <code>
                node scripts/restore-backup.js "RUTA-DEL-RESPALDO.sqlite"
              </code>
            </li>
            <li>
              El comando verifica el archivo y conserva una copia de la base
              actual antes de restaurar.
            </li>
            <li>
              Vuelve a iniciar con <code>npm run demo</code> o tu comando de
              producción.
            </li>
          </ol>
          <p className="muted">
            La restauración reemplaza pedidos, usuarios, menú y configuración por
            los del respaldo. Las sesiones se cierran al reiniciar. Las imágenes
            propias deben respaldarse por separado.
          </p>
          </>
        )}
        <h3>Si pierdes el acceso del dueño</h3>
        {offsite?.platform === "cloudflare" ? (
          <p className="muted">
            En Cloudflare → tu Worker → Configuración → Variables y secretos, crea el secreto{" "}
            <code>OWNER_RESET_PASSWORD</code> con una contraseña nueva (12+ caracteres) y vuelve a
            desplegar. Entra con el usuario <code>dueno</code> y esa contraseña, y después borra el
            secreto. No se eliminan pedidos.
          </p>
        ) : (
          <p className="muted">
            Detén el servidor, configura OWNER_PASSWORD y OWNER_USERNAME en tu
            .env y ejecuta <code>npm run reset-owner</code>. El comando modifica
            únicamente la cuenta indicada; no elimina pedidos.
          </p>
        )}
      </section>
    </div>
  );
}
