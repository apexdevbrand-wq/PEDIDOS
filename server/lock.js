import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { resolve } from "node:path";
const lock = () => resolve("data/server.lock");
export function ensureStopped() {
  if (!existsSync(lock())) return;
  let pid;
  try {
    pid = JSON.parse(readFileSync(lock(), "utf8")).pid;
    if (!Number.isInteger(pid)) throw Error("Inválido");
  } catch {
    throw Error(
      "No se puede verificar el bloqueo del servidor. Detén la app y revisa data/server.lock.",
    );
  }
  try {
    process.kill(pid, 0);
  } catch (e) {
    if (e.code === "ESRCH") {
      unlinkSync(lock());
      return;
    }
    throw Error("No se puede comprobar si el servidor está activo.");
  }
  throw Error(
    "Detén el servidor con Ctrl+C antes de restaurar, reiniciar otro proceso o recuperar una cuenta.",
  );
}
export function claimInstance() {
  mkdirSync("data", { recursive: true });
  ensureStopped();
  writeFileSync(lock(), JSON.stringify({ pid: process.pid }), {
    flag: "wx",
    mode: 0o600,
  });
  function release() {
    try {
      if (JSON.parse(readFileSync(lock(), "utf8")).pid === process.pid)
        unlinkSync(lock());
    } catch {}
  }
  process.once("exit", release);
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, () => {
      release();
      process.exit(0);
    });
}
