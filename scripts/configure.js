import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { existsSync, writeFileSync } from "node:fs";
import { ensureStopped } from "../server/lock.js";
try {
  ensureStopped();
  if (existsSync(".env"))
    throw Error(
      "Ya existe .env. No se sobrescribió. Edita OWNER_USERNAME y OWNER_PASSWORD; si la cuenta ya existe, usa npm run reset-owner con el servidor detenido.",
    );
  let hidden = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!hidden) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const ask = (question, secret = false) =>
    new Promise((resolve) => {
      hidden = false;
      rl.question(question, (answer) => {
        hidden = false;
        if (secret) process.stdout.write("\n");
        resolve(answer);
      });
      hidden = secret;
    });
  try {
    const username =
      (await ask("Usuario del dueño [dueno]: ")).trim() || "dueno";
    if (!/^[a-z0-9._-]{3,40}$/.test(username))
      throw Error(
        "El usuario debe tener 3 a 40 letras minúsculas, números, puntos o guiones.",
      );
    const password = await ask(
      "Contraseña del dueño (mínimo 12 caracteres; no se muestra): ",
      true,
    );
    if (password.length < 12 || password.length > 256)
      throw Error("La contraseña debe tener 12 a 256 caracteres.");
    if (/[\r\n']/.test(password))
      throw Error(
        "Usa una contraseña sin comillas simples ni saltos de línea para guardarla en .env.",
      );
    const confirm = await ask("Repite la contraseña: ", true);
    if (password !== confirm) throw Error("Las contraseñas no coinciden.");
    writeFileSync(
      ".env",
      `PORT=3000\nSERVE_BUILD=1\nOWNER_USERNAME=${JSON.stringify(username)}\nOWNER_PASSWORD='${password}'\n`,
      { flag: "wx", mode: 0o600 },
    );
    console.log(
      "Configuración guardada en .env. Ejecuta npm run demo y entra con tu usuario. Crea las cuentas de cocina desde Administración → Equipo y actividad.",
    );
  } finally {
    rl.close();
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
