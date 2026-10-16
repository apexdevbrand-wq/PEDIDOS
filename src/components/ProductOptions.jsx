import React, { useState } from "react";
import Modal from "./Modal";
import { money } from "../api";
export default function ProductOptions({ product, onAdd, onClose }) {
  const [selections, setSelections] = useState(() =>
    Object.fromEntries(
      (product.options || []).map((g) => [
        g.id,
        g.min > 0
          ? g.choices
              .filter((c) => c.active)
              .slice(0, g.min)
              .map((c) => c.id)
          : [],
      ]),
    ),
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  let extra = 0;
  for (const g of product.options || [])
    for (const id of selections[g.id] || [])
      extra += g.choices.find((c) => c.id === id)?.price || 0;
  function toggle(g, id) {
    setSelections((s) => ({
      ...s,
      [g.id]:
        g.max === 1
          ? [id]
          : (s[g.id] || []).includes(id)
            ? s[g.id].filter((x) => x !== id)
            : [...(s[g.id] || []), id],
    }));
  }
  return (
    <Modal title={"Personaliza " + product.name} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (
            product.options.some(
              (g) =>
                (selections[g.id] || []).length < g.min ||
                (selections[g.id] || []).length > g.max,
            )
          ) {
            setError(
              "Revisa cuántas opciones puedes seleccionar en cada grupo.",
            );
            return;
          }
          onAdd(selections, notes);
          onClose();
        }}
      >
        {product.options.map((g) => (
          <fieldset className="option-group" key={g.id}>
            <legend>
              {g.name}{" "}
              <small>
                {g.min ? "Obligatorio" : "Opcional"} ·{" "}
                {g.max === 1 ? "Elige una" : `Hasta ${g.max}`}
              </small>
            </legend>
            {g.choices.map((c) => (
              <label className="choice-row" key={c.id}>
                <input
                  type={g.max === 1 ? "radio" : "checkbox"}
                  name={g.id}
                  checked={(selections[g.id] || []).includes(c.id)}
                  disabled={!c.active}
                  onChange={() => toggle(g, c.id)}
                />
                <span>
                  {c.label}
                  {!c.active ? " · Agotado" : ""}
                </span>
                <b>{c.price ? "+ " + money(c.price) : "Incluido"}</b>
              </label>
            ))}
          </fieldset>
        ))}
        <label>
          Notas del platillo
          <textarea
            value={notes}
            maxLength={300}
            placeholder="Sin cebolla, salsa aparte…"
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <button className="primary full">
          Agregar al pedido · {money(product.price + extra)}
        </button>
      </form>
    </Modal>
  );
}
