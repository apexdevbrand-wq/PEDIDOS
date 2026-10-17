import test from "node:test";
import assert from "node:assert/strict";
import { migrateDemoMenu, seedProducts, seedCategories, seedZones } from "../server/seed.js";

test("el menú de demostración se sustituye por el menú real; uno personalizado no", () => {
  const demo = {
    products: ["Burger Santa", "Alitas BBQ", "Pizza pepperoni"].map((name, i) => ({ id: i + 1, name, category: "Alitas", image: `/images/food-${i + 1}.jpg` })),
    ingredients: [{ id: "masa", name: "Masa", available: false }],
  };
  assert.equal(migrateDemoMenu(demo), true);
  assert.equal(demo.products.length, seedProducts.length);
  assert.deepEqual(demo.categories.map((c) => c.name), seedCategories.map((c) => c.name));
  assert.ok(demo.ingredients.some((i) => i.id === "masa" && i.available === false), "conserva insumos propios");
  assert.ok(demo.ingredients.some((i) => i.id === "elote"));

  const custom = { products: [{ id: 1, name: "Mío", image: "/uploads/abc.webp" }, { id: 2, name: "Alitas BBQ", image: "/images/food-2.jpg" }] };
  assert.equal(migrateDemoMenu(custom), false);
  assert.equal(custom.products[0].name, "Mío");
  const photo = { products: [{ id: 1, name: "Hamburguesa Santa", image: "/uploads/mia.png" }] };
  assert.equal(migrateDemoMenu(photo), false, "si ya subió fotos propias no se toca");
  const v2 = { products: [{ id: 1, name: "Hamburguesa Santa", image: "/images/products/hamburguesa-queso.png" }, { id: 9, name: "Tostilocos", image: "" }] };
  assert.equal(migrateDemoMenu(v2), true, "el menú de ejemplo de la v2 también se actualiza");
  assert.ok(v2.products.some((p) => p.name === "Kittychela"));
  assert.equal(migrateDemoMenu(v2), false, "no se vuelve a migrar");
});

test("el menú inicial es coherente", () => {
  const ids = seedProducts.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  const cats = new Set(seedCategories.map((c) => c.name));
  for (const p of seedProducts) assert.ok(cats.has(p.category), p.name);
  assert.equal(seedProducts.find((p) => p.id === 1).price, 6000);
  assert.ok(seedProducts.length >= 46, "incluye toda la carta");
  assert.ok(seedZones.every((z) => Number.isInteger(z.deliveryMinutes)));
});
