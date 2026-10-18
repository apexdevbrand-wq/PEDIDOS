import { ensureStopped } from "../server/lock.js";
try {
  ensureStopped();
  await import("../server/store.js");
  const { resetOwnerFromEnvironment } = await import("../server/auth.js");
  await resetOwnerFromEnvironment();
  console.log(
    "Cuenta del dueño recuperada. No se modificaron los pedidos. Reinicia el servidor.",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
