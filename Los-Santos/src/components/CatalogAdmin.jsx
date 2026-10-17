import React, { useState, useEffect, useMemo } from "react";
import { ArrowUp, ArrowDown, Plus, Star, Pencil, SlidersHorizontal, Archive, RotateCcw, Eye, EyeOff, Trash2, Search } from "lucide-react";
import { api, money } from "../api";
import ProductEditor from "./ProductEditor";
import ProductForm from "./ProductForm";
import ProductPhoto from "./ProductPhoto";

export default function CatalogAdmin({ run, refresh }) {
  const [data, setData] = useState(null),
    [ingredients, setIngredients] = useState([]),
    [selected, setSelected] = useState("all"),
    [view, setView] = useState("active"),
    [query, setQuery] = useState(""),
    [form, setForm] = useState(null),
    [options, setOptions] = useState(null),
    [newCategory, setNewCategory] = useState(""),
    [renaming, setRenaming] = useState(null),
    [flash, setFlash] = useState("");

  async function load() {
    const [catalog, ing] = await Promise.all([api("/staff/catalog"), api("/staff/ingredients")]);
    setData(catalog);
    setIngredients(ing);
  }
  useEffect(() => {
    run(load);
  }, []);
  const reload = async (message) => {
    await load();
    await refresh();
    if (message) {
      setFlash(message);
      setTimeout(() => setFlash(""), 3500);
    }
  };
  const mutate = (fn, message) =>
    run(async () => {
      const r = await fn();
      await reload(message);
      return r;
    });

  const categories = data?.categories || [];
  const list = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.products.filter(
      (p) =>
        (view === "archived" ? p.archived : !p.archived) &&
        (selected === "all" || p.category === selected) &&
        (!q || p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)),
    );
  }, [data, selected, view, query]);

  if (!data) return <p role="status">Cargando catálogo…</p>;

  const counts = Object.fromEntries(
    categories.map((c) => [c.name, data.products.filter((p) => p.category === c.name && !p.archived).length]),
  );
  const archivedCount = data.products.filter((p) => p.archived).length;

  function moveCategory(index, delta) {
    const ids = categories.map((c) => c.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    mutate(() => api("/staff/categories-order", "PUT", { ids }));
  }
  function moveProduct(p, delta) {
    const siblings = data.products.filter((x) => x.category === p.category);
    const i = siblings.findIndex((x) => x.id === p.id);
    const j = i + delta;
    if (j < 0 || j >= siblings.length) return;
    const ids = siblings.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    mutate(() => api("/staff/products-order", "PUT", { ids }));
  }
  const patch = (p, body, message) => mutate(() => api("/staff/products/" + p.id, "PATCH", body), message);

  return (
    <div className="catalog-admin">
      <aside className="panel category-rail" aria-label="Categorías">
        <h2>Categorías</h2>
        <button className={"rail-item" + (selected === "all" ? " active" : "")} onClick={() => setSelected("all")}>
          <span>Todo el menú</span>
          <small>{data.products.filter((p) => !p.archived).length}</small>
        </button>
        {categories.map((c, i) => (
          <div className={"rail-row" + (c.active ? "" : " is-hidden")} key={c.id}>
            {renaming?.id === c.id ? (
              <form
                className="rename-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await mutate(() => api("/staff/categories/" + c.id, "PATCH", { name: renaming.name, tagline: renaming.tagline }), "Categoría actualizada.");
                  if (ok) {
                    if (selected === c.name) setSelected(renaming.name.trim());
                    setRenaming(null);
                  }
                }}
              >
                <input
                  autoFocus
                  aria-label={"Nuevo nombre para " + c.name}
                  maxLength={40}
                  value={renaming.name}
                  onChange={(e) => setRenaming((r) => ({ ...r, name: e.target.value }))}
                  onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                />
                <input
                  aria-label={"Frase bajo el título de " + c.name}
                  placeholder="Frase (opcional), ej. Pecados capitales"
                  maxLength={60}
                  value={renaming.tagline}
                  onChange={(e) => setRenaming((r) => ({ ...r, tagline: e.target.value }))}
                  onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                />
                <button className="primary small">Guardar</button>
              </form>
            ) : (
              <button className={"rail-item" + (selected === c.name ? " active" : "")} onClick={() => setSelected(c.name)}>
                <span>
                  {c.name}
                  {!c.active && <em> · oculta</em>}
                </span>
                <small>{counts[c.name] || 0}</small>
              </button>
            )}
            {selected === c.name && !renaming && (
              <div className="rail-tools">
                <button aria-label={"Subir " + c.name} disabled={i === 0} onClick={() => moveCategory(i, -1)}>
                  <ArrowUp size={15} />
                </button>
                <button aria-label={"Bajar " + c.name} disabled={i === categories.length - 1} onClick={() => moveCategory(i, 1)}>
                  <ArrowDown size={15} />
                </button>
                <button onClick={() => setRenaming({ id: c.id, name: c.name, tagline: c.tagline || "" })}>Editar nombre</button>
                <button
                  onClick={() =>
                    mutate(
                      () => api("/staff/categories/" + c.id, "PATCH", { active: !c.active }),
                      c.active ? "Categoría oculta para clientes." : "Categoría visible otra vez.",
                    )
                  }
                >
                  {c.active ? <EyeOff size={15} /> : <Eye size={15} />}
                  {c.active ? "Ocultar" : "Mostrar"}
                </button>
                {!data.products.some((p) => p.category === c.name) && (
                  <button
                    className="danger-link"
                    onClick={async () => {
                      const ok = await mutate(() => api("/staff/categories/" + c.id, "DELETE"), "Categoría eliminada.");
                      if (ok) setSelected("all");
                    }}
                  >
                    <Trash2 size={15} /> Eliminar
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        <form
          className="new-category"
          onSubmit={async (e) => {
            e.preventDefault();
            const c = await mutate(() => api("/staff/categories", "POST", { name: newCategory }), "Categoría creada.");
            if (c) {
              setNewCategory("");
              setSelected(c.name);
            }
          }}
        >
          <input
            required
            maxLength={40}
            placeholder="Nueva categoría"
            aria-label="Nombre de la nueva categoría"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <button className="secondary" aria-label="Crear categoría">
            <Plus size={18} />
          </button>
        </form>
      </aside>

      <section className="panel catalog-main">
        <div className="catalog-toolbar">
          <h2>{selected === "all" ? "Todo el menú" : selected}</h2>
          <label className="search">
            <Search size={16} aria-hidden="true" />
            <input type="search" placeholder="Buscar platillo" aria-label="Buscar platillo" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="segmented small">
            <button className={view === "active" ? "active" : ""} onClick={() => setView("active")}>
              En el menú
            </button>
            <button className={view === "archived" ? "active" : ""} onClick={() => setView("archived")}>
              Archivados ({archivedCount})
            </button>
          </div>
          <button className="primary" onClick={() => setForm({ product: null })} disabled={!categories.length}>
            <Plus size={18} aria-hidden="true" /> Nuevo producto
          </button>
        </div>
        {flash && (
          <p className="success flash" role="status">
            {flash}
          </p>
        )}
        {!list.length && (
          <p className="muted catalog-empty">
            {view === "archived"
              ? "No hay productos archivados."
              : query
                ? "Ningún platillo coincide con la búsqueda."
                : "Esta categoría está vacía. Crea el primer producto."}
          </p>
        )}
        <ul className="catalog-list">
          {list.map((p) => (
            <li key={p.id} className={"catalog-item" + (!p.enabled ? " is-off" : "")}>
              <ProductPhoto product={p} className="catalog-thumb" />
              <div className="catalog-text">
                <b>
                  {p.name}
                  {p.featured && <Star size={14} className="star" aria-label="Favorito" />}
                </b>
                <small>
                  {p.category} · {money(p.price)}
                  {p.options?.length ? ` · ${p.options.length} grupo(s) de opciones` : ""}
                </small>
                {p.unavailableReason && !p.archived && p.enabled && <small className="stock-warning">{p.unavailableReason}</small>}
              </div>
              {!p.archived ? (
                <div className="catalog-actions">
                  <button
                    role="switch"
                    aria-checked={p.enabled}
                    aria-label={"Disponible: " + p.name}
                    title={p.enabled ? "Disponible" : "Agotado / pausado"}
                    className={"toggle " + (p.enabled ? "on" : "")}
                    onClick={() => patch(p, { active: !p.enabled })}
                  >
                    <span />
                  </button>
                  <button className="icon-button" onClick={() => setForm({ product: p })} aria-label={"Editar " + p.name}>
                    <Pencil size={16} /> <span>Editar</span>
                  </button>
                  <button className="icon-button" onClick={() => setOptions(p)} aria-label={"Opciones e insumos de " + p.name}>
                    <SlidersHorizontal size={16} /> <span>Opciones</span>
                  </button>
                  {selected !== "all" && !query && (
                    <>
                      <button className="icon-button" aria-label={"Subir " + p.name} onClick={() => moveProduct(p, -1)}>
                        <ArrowUp size={16} />
                      </button>
                      <button className="icon-button" aria-label={"Bajar " + p.name} onClick={() => moveProduct(p, 1)}>
                        <ArrowDown size={16} />
                      </button>
                    </>
                  )}
                  <button
                    className="icon-button danger"
                    aria-label={"Archivar " + p.name}
                    onClick={() => patch(p, { archived: true }, `“${p.name}” se archivó. Los pedidos anteriores no cambian.`)}
                  >
                    <Archive size={16} /> <span>Archivar</span>
                  </button>
                </div>
              ) : (
                <div className="catalog-actions">
                  <button className="secondary" onClick={() => patch(p, { archived: false }, `“${p.name}” volvió al menú.`)}>
                    <RotateCcw size={16} /> Devolver al menú
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {selected !== "all" && view === "active" && !query && list.length > 1 && (
          <p className="muted">Usa las flechas para cambiar el orden en que aparecen en el menú.</p>
        )}
      </section>

      {form && (
        <ProductForm
          product={form.product}
          categories={categories}
          defaultCategory={selected !== "all" ? selected : undefined}
          run={run}
          onClose={() => setForm(null)}
          onSaved={async (saved, isNew) => {
            setForm(null);
            await reload(
              isNew
                ? `“${saved.name}” ya está en el menú. Usa “Opciones” para tamaños, salsas o extras.`
                : "Cambios guardados.",
            );
          }}
        />
      )}
      {options && (
        <ProductEditor
          product={options}
          ingredients={ingredients}
          onClose={() => setOptions(null)}
          run={run}
          refresh={() => reload("Opciones guardadas.")}
        />
      )}
    </div>
  );
}
