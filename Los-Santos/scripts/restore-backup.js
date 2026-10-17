import { DatabaseSync, backup } from "node:sqlite";
import { existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { ensureStopped } from "../server/lock.js";
try {
  ensureStopped();
  const input = process.argv[2];
  if (!input)
    throw Error(
      'Uso: node scripts/restore-backup.js "RUTA-DEL-RESPALDO.sqlite"',
    );
  const sourcePath = resolve(input),
    target = resolve("data/orders.sqlite");
  if (sourcePath === target || !existsSync(sourcePath))
    throw Error("Elige un respaldo existente distinto de la base activa.");
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    if (
      source.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" ||
      !source
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='orders'",
        )
        .get()
    )
      throw Error("El archivo no es un respaldo íntegro de Los Santos.");
    mkdirSync("data/backups", { recursive: true });
    if (existsSync(target)) {
      const current = new DatabaseSync(target);
      try {
        await backup(
          current,
          join(
            "data/backups",
            "manual-before-restore-" + Date.now() + ".sqlite",
          ),
        );
      } finally {
        current.close();
      }
    }
    const temporary = target + ".restore.tmp";
    try {
      if (existsSync(temporary)) unlinkSync(temporary);
      await backup(source, temporary);
      for (const suffix of ["-wal", "-shm"])
        if (existsSync(target + suffix)) unlinkSync(target + suffix);
      renameSync(temporary, target);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  } finally {
    source.close();
  }
  console.log(
    "Respaldo verificado y restaurado. La base anterior quedó preservada en data/backups. Reinicia la aplicación.",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
