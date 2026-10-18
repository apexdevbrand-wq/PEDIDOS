// Respaldos programados y copia externa, iguales en Node y Cloudflare.
import { backups, uploads, schedule, platform } from "./runtime.js";
import { getMeta, setMeta } from "./store-core.js";
import { shipBackup, offsiteConfig } from "./offsite.js";

export const offsiteEnabled = () => Boolean(offsiteConfig());
export const makeBackup = (prefix) => backups.make(prefix);
export const listBackups = () => backups.list();
export const readBackup = (name) => backups.read(name);
export function shipOffsite(backup) {
  return shipBackup({
    backupName: backup.name,
    readBackup: (name) => backups.read(name),
    uploadNames: uploads.list(),
    readUpload: (name) => uploads.get(name),
    getMeta,
    setMeta,
  });
}
async function automatic() {
  try {
    const backup = await backups.make("auto");
    if (offsiteEnabled())
      await shipOffsite(backup).catch((e) =>
        console.error("No se pudo copiar el respaldo fuera del servidor:", e.message),
      );
    backups.prune();
  } catch (e) {
    console.error("No se pudo completar el respaldo automático:", e.code || e.message);
  }
}
export function startBackups() {
  // En Node el proceso arranca pocas veces: respaldo al iniciar. En
  // Cloudflare el objeto despierta a menudo; solo se respalda cada 6 h.
  if (platform === "node") void automatic();
  schedule.every("backup", 6 * 60 * 60 * 1000, automatic);
}
