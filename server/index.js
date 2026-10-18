import "./instance.js";
import { resolve } from "node:path";
import express from "express";
import "./store.js";
import { realtime } from "./runtime.js";
import { createApp } from "./app.js";

const app = express();
app.use(express.json({ limit: "30kb" }));
await createApp(app, { raw: express.raw });
app.get("/api/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  res.write(": connected\n\n");
  realtime.add(res);
  const timer = setInterval(() => res.write(": ping\n\n"), 20000);
  req.on("close", () => {
    clearInterval(timer);
    realtime.remove(res);
  });
});
const availabilityTimer = setInterval(() => realtime.broadcast(), 60000);
availabilityTimer.unref();
if (process.env.NODE_ENV === "production" || process.env.SERVE_BUILD === "1") {
  app.get(["/personal", "/personal/"], (_, res) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    });
    res.sendFile(resolve("dist/index.html"));
  });
  app.use(
    "/assets",
    express.static("dist/assets", { immutable: true, maxAge: "1y" }),
  );
  app.use(express.static("dist", { maxAge: 0 }));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({ server: { middlewareMode: true } });
  app.use(vite.middlewares);
}
app.listen(
  Number(process.env.PORT) || 3000,
  process.env.SERVE_BUILD === "1" && process.env.NODE_ENV !== "production"
    ? "127.0.0.1"
    : "0.0.0.0",
  () => console.log("Los Santos listo en puerto " + (process.env.PORT || 3000)),
);
