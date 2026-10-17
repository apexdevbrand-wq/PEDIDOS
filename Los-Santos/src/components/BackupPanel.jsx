import React, { useState, useEffect } from "react";
import { api } from "../api";
export default function BackupPanel({ run }) {
  const [backups, setBackups] = useState([]),
    [offsite, setOffsite] = useState(null),
    [shipping, setShipping] = useState(false),
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
          Respaldo al iniciar, antes de actualizar y cada 6 horas mientras el
          servidor esté encendido. Se conservan los últimos 56 automáticos; los
          manuales no se eliminan automáticamente.
        </p>
        {offsite && (
          <div className={"offsite " + (offsite.configured ? (offsite.lastError ? "is-bad" : "is-ok") : "is-off")}>
            <b>Copia fuera del servidor</b>
            {!offsite.configured ? (
              <p>
                Sin configurar. Conecta un almacenamiento gratuito (Cloudflare R2) siguiendo
                docs/DEPLOYMENT.md para que cada respaldo y cada foto se copien solos.
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
        <h3>Si pierdes el acceso del dueño</h3>
        <p className="muted">
          Detén el servidor, configura OWNER_PASSWORD y OWNER_USERNAME en tu
          .env y ejecuta <code>npm run reset-owner</code>. El comando modifica
          únicamente la cuenta indicada; no elimina pedidos.
        </p>
      </section>
    </div>
  );
}
