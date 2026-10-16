import test from "node:test";
import assert from "node:assert/strict";
import { price, transitions } from "../server/domain.js";
const products = [
    { id: 1, name: "Burger", price: 12900, active: true },
    { id: 2, name: "Agotado", price: 5000, active: false },
  ],
  items = [{ id: 1, quantity: 2 }];
test("recoger con efectivo no cobra envío ni recargo", () => {
  const p = price(items, products, null, "pickup", "cash");
  assert.equal(p.total, 25800);
  assert.equal(p.shipping, 0);
  assert.equal(p.surcharge, 0);
});
test("MP cobra 4% sobre productos más envío", () => {
  const p = price(
    items,
    products,
    { active: true, fee: 3500 },
    "delivery",
    "mp",
  );
  assert.equal(p.surcharge, 1172);
  assert.equal(p.total, 30472);
});
test("efectivo con envío no lleva recargo", () => {
  const p = price(
    items,
    products,
    { active: true, fee: 3500 },
    "delivery",
    "cash",
  );
  assert.equal(p.total, 29300);
  assert.equal(p.surcharge, 0);
});
test("rechaza agotados, cantidades y colonias inválidas", () => {
  for (const i of [
    [{ id: 2, quantity: 1 }],
    [{ id: 1, quantity: -1 }],
    [{ id: 1, quantity: 1.5 }],
    [],
  ])
    assert.throws(() => price(i, products, null, "pickup", "cash"));
  assert.throws(() =>
    price(items, products, { active: false, fee: 100 }, "delivery", "cash"),
  );
});
test("no confía en precio del cliente y redondea a centavos", () => {
  assert.equal(
    price([{ id: 1, quantity: 1, price: 1 }], products, null, "pickup", "mp")
      .total,
    13416,
  );
  assert.equal(
    price(
      [{ id: 3, quantity: 1 }],
      [{ id: 3, price: 101, active: true }],
      null,
      "pickup",
      "mp",
    ).surcharge,
    4,
  );
});
test("no permite reabrir pedidos terminados", () => {
  assert.deepEqual(transitions.completed, []);
  assert.ok(transitions.pending.includes("cooking"));
  assert.ok(!transitions.pending.includes("completed"));
});
