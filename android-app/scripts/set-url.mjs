// Fija la dirección HTTPS del negocio que abrirá la app: node scripts/set-url.mjs https://pedidos.tudominio.com
import { readFileSync, writeFileSync } from "node:fs";
const input = process.argv[2] || process.env.SITE_URL || "";
let url;
try {
  url = new URL(input);
} catch {
  throw Error("Indica la dirección pública, por ejemplo https://pedidos.tudominio.com");
}
if (url.protocol !== "https:") throw Error("La dirección debe empezar con https://");
const file = new URL("../capacitor.config.json", import.meta.url);
const config = JSON.parse(readFileSync(file, "utf8"));
config.server.url = url.origin + "/personal";
writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
console.log("La app abrirá " + config.server.url);
