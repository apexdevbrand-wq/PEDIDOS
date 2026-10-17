import { existsSync } from "node:fs";
if (Number(process.versions.node.split(".")[0]) < 24)
  throw Error("Instala Node.js 24 o posterior para usar SQLite.");
const mode = process.argv[2] || "demo";
if (!["start", "demo", "dev"].includes(mode)) throw Error("Modo inválido");
if (mode !== "dev" && !existsSync("dist/index.html"))
  throw Error("Primero ejecuta npm run build para preparar la interfaz.");
process.env.NODE_ENV = mode === "start" ? "production" : "development";
process.env.SERVE_BUILD = mode === "dev" ? "0" : "1";
await import("../server/index.js");
