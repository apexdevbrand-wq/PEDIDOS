// Menú inicial de Los Santos (Minatitlán, Ver.), tomado de la carta impresa
// “¿Qué se te antoja hoy?”. Precios en centavos. El dueño puede cambiar todo
// en Administración → Catálogo sin tocar código.
const choice = (label, price = 0, ingredientIds = []) => ({
  id: label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50),
  label,
  price,
  active: true,
  ingredientIds,
});
const group = (id, name, min, max, choices) => ({ id, name, min, max, choices });

const SALSAS = ["BBQ", "Ranch parmesano", "Parmesano", "Ajo ranch", "Lemon pepper", "Tajín", "Mango habanero", "Mango habanero tajín"];
const salsas = (max = 2) => group("salsa", max > 1 ? "Salsas" : "Salsa", 1, max, SALSAS.map((s) => choice(s)));
const POLVOS = ["Chips fuego", "Takis fuego", "Doritos nacho", "Cheetos flamin'", "Ruffles de queso", "Chips verdes"];
const polvo = group("polvo", "Sabrita", 1, 1, POLVOS.map((s) => choice(s, 0, ["frituras"])));
const burgerExtras = group("extras", "Extras", 0, 3, [
  choice("Queso extra", 1500, ["queso"]),
  choice("Tocino extra", 2000),
  choice("Orden de papas", 6000, ["papas"]),
]);
const refresco = group("refresco", "Refresco", 1, 1, ["Cola", "Cola sin azúcar", "Lima-limón", "Naranja", "Manzana", "Toronja"].map((s) => choice(s)));
const promoMiches = group("promo", "Promoción", 0, 1, [choice("2 micheladas de sabor por $150", 15000, ["limon"])]);

export const seedCategories = [
  ["Combos", "Para compartir… o no"],
  ["Hamburguesas", "Pecados capitales"],
  ["Alitas y boneless", "8 salsas para pecar"],
  ["Diablitros", "Miches bien preparadas"],
  ["Drinks", "Mojitos, sodas y más"],
  ["La Elotiza", "Esquites, elotes y charolas"],
  ["Mariscos", "Aguachile fresco"],
].map(([name, tagline], i) => ({
  id: name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, ""),
  name,
  tagline,
  sortOrder: i,
  active: true,
}));

const P = (f) => `/images/products/${f}.png`;
const J = (f) => `/images/${f}.jpg`;
// id, nombre, categoría, centavos, descripción, imagen, insumos, opciones, { featured, archived }
const rows = [
  // Hamburguesas — Pecados capitales
  [1, "Hamburguesa sencilla", "Hamburguesas", 6000, "Carne a la parrilla con queso, lechuga y jitomate.", P("hamburguesa-queso"), ["res", "pan"], [burgerExtras]],
  [2, "Hamburguesa especial", "Hamburguesas", 8000, "La sencilla, pero con más: tocino y queso extra.", J("burger-especial"), ["res", "pan"], [burgerExtras]],
  [5, "Hamburguesa hawaiana", "Hamburguesas", 8000, "Con piña asada, tocino y queso derretido.", P("hamburguesa-tocino-pina"), ["res", "pan"], [burgerExtras]],
  [6, "Hamburguesa Los Santos", "Hamburguesas", 11000, "La de la casa: la más cargada del menú.", J("promo-sencilla"), ["res", "pan"], [burgerExtras], { featured: true }],
  [7, "Hotdog", "Hamburguesas", 3500, "Salchicha en pan suave con aderezos.", "", ["salchicha", "pan"], []],
  [8, "Orden de papas", "Hamburguesas", 6000, "Papas a la francesa crujientes.", J("food-2"), ["papas"], []],
  // Alitas y boneless
  [3, "Alitas", "Alitas y boneless", 13500, "Bañadas en la salsa que elijas. Escoge 10, 15 o 20 piezas.", J("alitas"), ["pollo"], [
    group("piezas", "Piezas", 1, 1, [choice("10 piezas"), choice("15 piezas", 4500), choice("20 piezas", 11500)]),
    salsas(),
  ], { featured: true }],
  [4, "Boneless", "Alitas y boneless", 14500, "Pollo empanizado sin hueso. 300 g, 500 g o 1 kg pa' la banda.", J("boneless"), ["pollo"], [
    group("gramos", "Cantidad", 1, 1, [choice("300 g"), choice("500 g", 7500), choice("Pa' la banda (1 kg)", 25500)]),
    salsas(),
  ]],
  // Combos
  [9, "Combo Los Santos", "Combos", 26000, "Hamburguesa Los Santos con papas + 10 alitas o 300 g de boneless.", J("promo-wings"), ["res", "pan", "papas", "pollo"], [
    group("pollo", "Acompáñala con", 1, 1, [choice("10 alitas"), choice("300 g de boneless")]),
    salsas(),
  ], { featured: true }],
  [10, "3 hotdogs", "Combos", 9000, "Tres hotdogs para compartir (o no).", "", ["salchicha", "pan"], []],
  [11, "Papaboneless y esquite ½ litro", "Combos", 24000, "Papas con boneless y un esquite de medio litro.", "", ["papas", "pollo", "elote"], [salsas(1)]],
  [12, "Vaso botanero", "Combos", 13500, "Escoge tu refresco y tu botana: boneless, aguachile o esquisopa.", J("vaso-botanero"), [], [
    refresco,
    group("botana", "Botana", 1, 1, [choice("Boneless", 0, ["pollo"]), choice("Aguachile", 4500, ["camaron"]), choice("Esquisopa", 1500, ["elote"])]),
  ]],
  [13, "300 g boneless + 5 alitas", "Combos", 20000, "300 g de boneless y 5 alitas.", J("promo-wings"), ["pollo"], [salsas()], { archived: true }],
  [14, "Combo pa' la familia", "Combos", 32000, "300 g de boneless, 500 g de papas y 2 hamburguesas especial o hawaiana.", J("promo-especiales"), ["pollo", "papas", "res", "pan"], [salsas()], { archived: true }],
  // Diablitros — Miches
  [15, "Miche", "Diablitros", 8500, "Escarchada con chamoy y chile. Clásica o de sabor.", P("miche"), ["limon"], [
    group("sabor", "Sabor", 1, 1, [choice("Clásica"), choice("Clamato", 500), choice("Tamarindo", 500), choice("Fresa", 500, ["fresa"]), choice("Mango", 500)]),
  ], { featured: true }],
  [16, "Michepapas", "Diablitros", 11500, "Miche preparada con papas.", P("miche"), ["limon", "frituras"], []],
  [17, "Micheviche", "Diablitros", 13000, "Miche con ceviche.", P("miche"), ["limon", "camaron"], []],
  [18, "Micheaguachile", "Diablitros", 14000, "Miche con aguachile.", P("miche"), ["limon", "camaron"], []],
  [19, "Micheloca", "Diablitros", 12500, "La miche más loca de la casa.", P("miche"), ["limon"], []],
  // Drinks
  [20, "Mojito de limón", "Drinks", 9000, "Limón, hierbabuena y hielo.", P("mojito-limon"), ["limon"], []],
  [21, "Mojito de fresa", "Drinks", 10000, "Fresa, hierbabuena y hielo.", P("mojito-fresa"), ["fresa"], []],
  [22, "Mangodrink", "Drinks", 9000, "Bebida preparada de mango.", "", [], []],
  [23, "Piña colada", "Drinks", 12000, "Piña y coco, bien fría.", "", [], []],
  [24, "Paloma de fresa", "Drinks", 10000, "Paloma preparada con fresa.", "", ["fresa"], []],
  [25, "Barbie", "Drinks", 9000, "Bebida preparada rosa de la casa.", "", [], []],
  [26, "Azulito", "Drinks", 9000, "Bebida preparada azul de la casa.", "", [], []],
  [27, "Cherry", "Drinks", 9000, "Bebida preparada sabor cereza.", "", [], []],
  [28, "Kittychela", "Drinks", 16500, "Michelada en vaso de gatita con gomitas.", P("kittychela"), ["limon"], [], { featured: true }],
  [29, "Fruitsichela", "Drinks", 16500, "Michelada con fruta y gomitas.", "", ["limon"], []],
  [30, "Botanero", "Drinks", 17000, "Bebida con botana: tostitos preparados o papas salseadas.", "", ["frituras"], [
    group("botana", "Botana", 1, 1, [choice("Tostitos preparados"), choice("Papas salseadas")]),
  ]],
  [31, "Café frío", "Drinks", 5500, "Café con leche helado y caramelo.", P("cafe-caramelo"), ["cafe"], []],
  [32, "Soda italiana", "Drinks", 5500, "Pregunta por los sabores de perlas explosivas: sin costo.", "", [], [
    group("sabor", "Sabor", 1, 1, ["Manzana verde", "Mora azul", "Mango", "Fresa", "Frutos rojos"].map((s) => choice(s))),
    group("perlas", "Perlas explosivas", 0, 1, [choice("Agregar perlas (sin costo)")]),
  ]],
  [33, "Refresco", "Drinks", 3000, "Bien frío.", "", [], [refresco]],
  [34, "Topochico preparado", "Drinks", 5500, "Agua mineral preparada con limón y chile.", "", ["limon"], []],
  // La Elotiza
  [35, "Esquites", "La Elotiza", 3000, "En vaso, con mayonesa, queso y chile. Chico o grande.", P("esquites-vaso-logo"), ["elote", "queso"], [
    group("tamano", "Tamaño", 1, 1, [choice("Chico"), choice("Grande", 2500)]),
  ]],
  [36, "Elote tradicional", "La Elotiza", 3000, "Con mayonesa, queso y chile en polvo.", P("elote-esquite"), ["elote", "queso"], []],
  [37, "Elote espolvoreado", "La Elotiza", 4500, "Elote cubierto con la sabrita molida que elijas.", P("elote-espolvoreado"), ["elote", "frituras"], [polvo], { featured: true }],
  [38, "Esquilote natural", "La Elotiza", 7500, "Esquite y elote en un mismo antojo.", "", ["elote", "queso"], []],
  [39, "Esquilote con sabrita", "La Elotiza", 8500, "Esquilote con tu sabrita favorita.", "", ["elote", "frituras"], [polvo]],
  [40, "Esquisopa", "La Elotiza", 5500, "Esquite caldosito con todo.", P("esquites-vaso-lineas"), ["elote"], []],
  [41, "Esquisopa con sabrita", "La Elotiza", 7000, "Esquisopa con sabrita molida.", "", ["elote", "frituras"], [polvo]],
  [42, "Tostielote", "La Elotiza", 8500, "Tostitos con esquite y todos los toppings.", P("tostilocos"), ["elote", "frituras"], []],
  [43, "Tosticrunch", "La Elotiza", 5500, "Tostitos preparados bien crujientes.", "", ["frituras"], []],
  [44, "Charola de esquisopa", "La Elotiza", 12000, "Para compartir.", "", ["elote"], []],
  [45, "Charola de tostielote", "La Elotiza", 15000, "Para compartir.", "", ["elote", "frituras"], []],
  // Mariscos
  [46, "Tostichile individual", "Mariscos", 9500, "Tostitos con aguachile.", "", ["camaron", "frituras"], []],
  [47, "Aguachile ½ kg", "Mariscos", 21000, "Camarón en limón con chile, pepino y cebolla morada. Llévate 2 micheladas de sabor por $150.", J("aguachile"), ["camaron", "limon"], [promoMiches], { featured: true }],
  [48, "Aguachile 1 kg", "Mariscos", 40000, "Para la mesa completa. Llévate 2 micheladas de sabor por $150.", J("aguachile"), ["camaron", "limon"], [promoMiches]],
];
export const seedProducts = rows.map(([id, name, category, price, description, image, ingredientIds, options, flags = {}], i) => ({
  id,
  name,
  category,
  price,
  description,
  image,
  active: true,
  archived: Boolean(flags.archived),
  featured: Boolean(flags.featured),
  sortOrder: i,
  ingredientIds,
  options,
}));
export const seedIngredients = [
  ["pollo", "Pollo"],
  ["res", "Carne de res"],
  ["pan", "Pan"],
  ["salchicha", "Salchicha"],
  ["queso", "Queso"],
  ["papas", "Papas"],
  ["elote", "Elote / esquites"],
  ["frituras", "Sabritas / tostitos"],
  ["limon", "Limón"],
  ["camaron", "Camarón"],
  ["fresa", "Fresa"],
  ["cafe", "Café"],
].map(([id, name]) => ({ id, name, available: true }));
// deliveryMinutes: tiempo aproximado desde que el pedido sale del local.
export const seedZones = [
  { id: 1, name: "Centro", fee: 2500, deliveryMinutes: 15, active: true },
  { id: 2, name: "Insurgentes Norte", fee: 2000, deliveryMinutes: 10, active: true },
  { id: 3, name: "Insurgentes Sur", fee: 3000, deliveryMinutes: 20, active: true },
];

// Nombres de los menús de ejemplo de versiones anteriores (0.2, v2, 0.3/0.4).
const previousSeedNames = new Set([
  "Burger Santa", "Papas de la casa", "Alitas BBQ", "Boneless Buffalo", "Limonada mineral", "Pizza pepperoni",
  "Hamburguesa Santa", "Hamburguesa Pecado", "Tostilocos", "Elote Flamin'", "Esquites Santos", "Elote con queso y chile",
  "Mojito de fresa", "Café frío con caramelo", "Hamburguesa especial", "Papas a la francesa", "Alitas (10 piezas)",
  "Boneless 300 g", "Michelada escarchada", "Hamburguesa sencilla", "Combo boneless + alitas", "Combo sencilla",
  "2 burgers especiales", "Dedos de queso (4)", "Papas gajo", "Aguachile de camarón", "Tostada de ceviche", "Refresco",
]);

// Si la base todavía tiene un menú de ejemplo (de cualquier versión anterior)
// y el dueño no ha subido fotos propias, se cambia por la carta real. Los
// pedidos guardan nombre y precio propios, así que el historial no cambia.
export function migrateDemoMenu(state) {
  const products = state.products || [];
  if (!products.length) return false;
  const untouched = products.every(
    (p) => previousSeedNames.has(p.name) && !String(p.image || "").startsWith("/uploads/"),
  );
  if (!untouched || products.some((p) => p.name === "Kittychela")) return false;
  const keep = new Set(seedProducts.map((p) => p.id));
  // Productos antiguos con id que no existe en la carta nueva: se archivan.
  const leftovers = products
    .filter((p) => !keep.has(p.id))
    .map((p) => ({ ...p, archived: true, active: false, category: "Combos" }));
  state.products = [...structuredClone(seedProducts), ...leftovers];
  state.categories = structuredClone(seedCategories);
  const have = new Set((state.ingredients || []).map((i) => i.id));
  state.ingredients = [...(state.ingredients || []), ...seedIngredients.filter((i) => !have.has(i.id))];
  return true;
}
