import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
test("service worker muestra el aviso y abre solo enlaces del mismo negocio", async () => {
  const handlers = {},
    shown = [],
    opened = [];
  const context = {
    URL,
    self: {
      location: { origin: "https://pedidos.example" },
      registration: {
        showNotification: async (title, options) => {
          shown.push({ title, options });
        },
      },
      addEventListener: (event, fn) => {
        handlers[event] = fn;
      },
      skipWaiting: () => {},
    },
    clients: {
      matchAll: async () => [],
      openWindow: async (url) => opened.push(url),
    },
    caches: {},
  };
  vm.runInNewContext(
    readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
    context,
  );
  let done;
  handlers.push({
    data: {
      json: () => ({
        title: "Los Santos · LS-1",
        body: "Tu pedido fue rechazado: insumo agotado",
        url: "/?order=123",
        tag: "123",
      }),
    },
    waitUntil: (p) => {
      done = p;
    },
  });
  await done;
  assert.equal(shown[0].title, "Los Santos · LS-1");
  assert.match(shown[0].options.body, /rechazado/);
  handlers.notificationclick({
    notification: { close() {}, data: { url: "/?order=123" } },
    waitUntil: (p) => {
      done = p;
    },
  });
  await done;
  assert.equal(opened[0], "https://pedidos.example/?order=123");
  handlers.notificationclick({
    notification: {
      close() {},
      data: { url: "https://otro.example/phishing" },
    },
    waitUntil: (p) => {
      done = p;
    },
  });
  assert.equal(opened.length, 1);
});
