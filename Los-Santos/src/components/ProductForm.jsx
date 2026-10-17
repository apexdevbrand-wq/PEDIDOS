import React, { useState, useRef } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import Modal from "./Modal";
import ProductPhoto from "./ProductPhoto";
import { api, uploadImage, money } from "../api";
import { compressImage } from "../lib/image";

const toCents = (v) => Math.round(Number(String(v).replace(",", ".")) * 100);

export default function ProductForm({ product, categories, defaultCategory, onClose, onSaved, run }) {
  const isNew = !product;
  const [draft, setDraft] = useState(() => ({
    name: product?.name || "",
    category: product?.category || defaultCategory || categories[0]?.name || "",
    price: product ? (product.price / 100).toFixed(2) : "",
    description: product?.description || "",
    image: product?.image || "",
    active: product ? product.enabled ?? product.active : true,
    featured: product?.featured || false,
  }));
  const [photoState, setPhotoState] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const fileRef = useRef(null);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  async function pickPhoto(file) {
    if (!file) return;
    setError("");
    setPhotoState("Preparando foto…");
    try {
      const { blob } = await compressImage(file);
      setPhotoState(`Subiendo ${Math.round(blob.size / 1024)} KB…`);
      const { url } = await uploadImage(blob);
      set("image", url);
      setPhotoState("Foto lista. Guarda para publicarla.");
    } catch (e) {
      setPhotoState("");
      setError(e.message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit(e) {
    e.preventDefault();
    const price = toCents(draft.price);
    if (!Number.isInteger(price) || price < 0) return setError("Escribe un precio válido, por ejemplo 129 o 129.50.");
    setBusy(true);
    setError("");
    const body = {
      name: draft.name,
      category: draft.category,
      price,
      description: draft.description,
      image: draft.image,
      active: draft.active,
      featured: draft.featured,
    };
    const saved = await run(() =>
      isNew ? api("/staff/products", "POST", body) : api("/staff/products/" + product.id, "PATCH", body),
    );
    setBusy(false);
    if (saved) onSaved(saved, isNew);
  }

  return (
    <Modal title={isNew ? "Nuevo producto" : "Editar producto"} onClose={onClose}>
      <form onSubmit={submit} className="product-form">
        <div className="photo-picker">
          <div className="photo-preview">
            <ProductPhoto product={{ name: draft.name || "Tu platillo", image: draft.image }} />
            <span className="burst" aria-hidden="true">
              {draft.price ? money(toCents(draft.price) || 0).replace(".00", "") : "$"}
            </span>
          </div>
          <div className="photo-buttons">
            <label className="secondary file-button">
              <ImagePlus size={18} aria-hidden="true" />
              {draft.image ? "Cambiar foto" : "Subir foto"}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={(e) => pickPhoto(e.target.files?.[0])}
              />
            </label>
            {draft.image && (
              <button type="button" className="text-button" onClick={() => set("image", "")}>
                <Trash2 size={16} aria-hidden="true" /> Quitar foto
              </button>
            )}
            <small className="muted" role="status">
              {photoState || "Desde la galería o la cámara. Un PNG sin fondo se verá recortado sobre el rojo de la marca."}
            </small>
          </div>
        </div>
        <label>
          Nombre
          <input required maxLength={80} value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Ej. Boneless 300 g" />
        </label>
        <div className="form-columns">
          <label>
            Categoría
            <select required value={draft.category} onChange={(e) => set("category", e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                  {c.active ? "" : " (oculta)"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Precio (MXN)
            <input
              required
              inputMode="decimal"
              value={draft.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder="129"
            />
          </label>
        </div>
        <label>
          Descripción <small className="muted">{draft.description.length}/300</small>
          <textarea
            maxLength={300}
            rows={3}
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Qué lleva y por qué se antoja."
          />
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} />
          Disponible para pedir
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={draft.featured} onChange={(e) => set("featured", e.target.checked)} />
          Marcar como favorito de la casa
        </label>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <button className="primary full" disabled={busy || photoState.startsWith("Subiendo") || photoState.startsWith("Preparando")}>
          {busy ? "Guardando…" : isNew ? "Crear producto" : "Guardar cambios"}
        </button>
        {isNew && <p className="muted">Después podrás añadir tamaños, salsas, extras e insumos.</p>}
      </form>
    </Modal>
  );
}
