import test from "node:test";
import assert from "node:assert/strict";
import { price } from "../server/domain.js";
const product = {
  id: 1,
  name: "Burger",
  price: 10000,
  active: true,
  options: [
    {
      id: "size",
      name: "Tamaño",
      min: 1,
      max: 1,
      choices: [
        { id: "regular", label: "Regular", price: 0, active: true },
        { id: "large", label: "Grande", price: 3000, active: true },
      ],
    },
    {
      id: "extras",
      name: "Extras",
      min: 0,
      max: 2,
      choices: [
        { id: "cheese", label: "Queso", price: 1500, active: true },
        { id: "bacon", label: "Tocino", price: 2000, active: false },
      ],
    },
  ],
};
test("cobra opciones seleccionadas y conserva sus nombres en la línea", () => {
  const p = price(
    [
      {
        id: 1,
        quantity: 2,
        selections: { size: ["large"], extras: ["cheese"] },
      },
    ],
    [product],
    null,
    "pickup",
    "cash",
  );
  assert.equal(p.total, 29000);
  assert.equal(p.lines[0].price, 14500);
  assert.match(p.lines[0].optionLabels.join(", "), /Grande/);
});
test("rechaza opciones requeridas ausentes, duplicadas, inventadas o agotadas", () => {
  for (const selections of [
    {},
    { size: ["regular", "large"] },
    { size: ["invented"] },
    { size: ["regular"], extras: ["cheese", "cheese"] },
    { size: ["regular"], extras: ["bacon"] },
    { size: ["regular"], intruder: ["x"] },
  ])
    assert.throws(() =>
      price(
        [{ id: 1, quantity: 1, selections }],
        [product],
        null,
        "pickup",
        "cash",
      ),
    );
});
import {
  opening,
  defaultSettings,
  financialReport,
} from "../server/operations.js";
test("horario nocturno y pausa se aplican con zona horaria del negocio", () => {
  const settings = {
    ...defaultSettings,
    timezone: "UTC",
    scheduleEnabled: true,
    hours: Array.from({ length: 7 }, () => ({
      enabled: false,
      open: "12:00",
      close: "23:00",
    })),
  };
  settings.hours[1] = { enabled: true, open: "20:00", close: "02:00" };
  assert.equal(opening(settings, new Date("2026-10-19T21:00:00Z")).open, true);
  assert.equal(opening(settings, new Date("2026-10-20T01:00:00Z")).open, true);
  assert.equal(opening(settings, new Date("2026-10-20T03:00:00Z")).open, false);
  assert.equal(
    opening(
      { ...settings, pausedUntil: "2026-10-19T22:00:00Z" },
      new Date("2026-10-19T21:00:00Z"),
    ).open,
    false,
  );
});
test("reporte usa fecha de cobro y separa recargo, envío y reembolsos pendientes", () => {
  const orders = [
    {
      folio: "1",
      createdAt: "2026-10-14T18:00:00Z",
      paidAt: "2026-10-15T18:00:00Z",
      paymentStatus: "paid",
      payment: "mp",
      status: "rejected",
      subtotal: 10000,
      shipping: 2000,
      surcharge: 480,
      total: 12480,
    },
    {
      createdAt: "2026-10-15T18:00:00Z",
      paymentStatus: "unpaid",
      payment: "cash",
      status: "pending",
      total: 10000,
    },
  ];
  const r = financialReport(orders, { date: "2026-10-15", timezone: "UTC" });
  assert.equal(r.mpCollected, 12480);
  assert.equal(r.cashCollected, 0);
  assert.equal(r.shippingCollected, 2000);
  assert.equal(r.surchargeCollected, 480);
  assert.equal(r.refundRequired, 12480);
  assert.equal(r.pendingTotal, 10000);
});
test("un reembolso no borra el cobro histórico y se descuenta en la fecha de devolución", () => {
  const orders = [
    {
      folio: "MP-1",
      createdAt: "2026-10-14T18:00:00Z",
      paidAt: "2026-10-14T18:00:00Z",
      paymentStatus: "refunded",
      payment: "mp",
      status: "rejected",
      subtotal: 10000,
      shipping: 2000,
      surcharge: 480,
      total: 12480,
      refundEvents: [{ at: "2026-10-15T18:00:00Z", amount: 12480 }],
    },
  ];
  const first = financialReport(orders, {
      date: "2026-10-14",
      timezone: "UTC",
    }),
    second = financialReport(orders, { date: "2026-10-15", timezone: "UTC" });
  assert.equal(first.grossCollected, 12480);
  assert.equal(first.netCollected, 12480);
  assert.equal(second.refundedTotal, 12480);
  assert.equal(second.netCollected, -12480);
});
import { effectiveProducts } from "../server/operations.js";
test("un producto se bloquea cuando no quedan suficientes opciones obligatorias", () => {
  const state = {
    ingredients: [{ id: "queso", name: "Queso", available: false }],
    products: [
      {
        id: 1,
        active: true,
        ingredientIds: [],
        options: [
          {
            id: "size",
            min: 1,
            max: 1,
            choices: [{ id: "one", active: true, ingredientIds: ["queso"] }],
          },
        ],
      },
    ],
  };
  assert.equal(effectiveProducts(state)[0].active, false);
});
