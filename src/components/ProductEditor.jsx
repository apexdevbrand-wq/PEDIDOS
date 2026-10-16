import React, { useState } from "react";
import Modal from "./Modal";
import { api } from "../api";
export default function ProductEditor({
  product,
  ingredients,
  onClose,
  run,
  refresh,
}) {
  const [groups, setGroups] = useState(() =>
      structuredClone(product.options || []).map((g) => ({
        ...g,
        choices: g.choices.map((c) => ({
          ...c,
          active: c.enabled ?? c.active,
        })),
      })),
    ),
    [required, setRequired] = useState(product.ingredientIds || []),
    [busy, setBusy] = useState(false);
  const changeGroup = (id, fn) =>
    setGroups((gs) => gs.map((g) => (g.id === id ? fn(g) : g)));
  const changeChoice = (g, id, fn) =>
    changeGroup(g.id, (x) => ({
      ...x,
      choices: x.choices.map((c) => (c.id === id ? fn(c) : c)),
    }));
  return (
    <Modal title={"Opciones e insumos · " + product.name} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const result = await run(async () => {
            const p = await api(
              "/staff/products/" + product.id + "/options",
              "PUT",
              { options: groups, ingredientIds: required },
            );
            await refresh();
            return p;
          });
          setBusy(false);
          if (result) onClose();
        }}
      >
        <fieldset className="option-group">
          <legend>Insumos necesarios para el platillo</legend>
          <p className="muted">
            Si alguno se agota, se bloquea el platillo completo.
          </p>
          <div className="ingredient-checks">
            {ingredients.map((i) => (
              <label key={i.id}>
                <input
                  type="checkbox"
                  checked={required.includes(i.id)}
                  onChange={(e) =>
                    setRequired((ids) =>
                      e.target.checked
                        ? [...ids, i.id]
                        : ids.filter((id) => id !== i.id),
                    )
                  }
                />
                {i.name}
              </label>
            ))}
          </div>
        </fieldset>
        {groups.map((g) => (
          <fieldset className="option-editor-group" key={g.id}>
            <div className="line">
              <b>Grupo de opciones</b>
              <button
                type="button"
                className="danger-link"
                onClick={() =>
                  setGroups((gs) => gs.filter((x) => x.id !== g.id))
                }
              >
                Quitar grupo
              </button>
            </div>
            <label>
              Nombre del grupo
              <input
                required
                maxLength={80}
                value={g.name}
                placeholder="Tamaño, salsa, extras…"
                onChange={(e) =>
                  changeGroup(g.id, (x) => ({ ...x, name: e.target.value }))
                }
              />
            </label>
            <div className="form-columns">
              <label>
                Mínimo a elegir
                <input
                  type="number"
                  min="0"
                  max={g.choices.length}
                  required
                  value={g.min}
                  onChange={(e) =>
                    changeGroup(g.id, (x) => ({
                      ...x,
                      min: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Máximo a elegir
                <input
                  type="number"
                  min={g.min}
                  max={g.choices.length}
                  required
                  value={g.max}
                  onChange={(e) =>
                    changeGroup(g.id, (x) => ({
                      ...x,
                      max: Number(e.target.value),
                    }))
                  }
                />
              </label>
            </div>
            {g.choices.map((c) => (
              <div className="choice-editor" key={c.id}>
                <div className="form-columns">
                  <label>
                    Opción
                    <input
                      required
                      value={c.label}
                      maxLength={80}
                      onChange={(e) =>
                        changeChoice(g, c.id, (x) => ({
                          ...x,
                          label: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Precio extra MXN
                    <input
                      type="number"
                      min="0"
                      max="10000"
                      step="0.01"
                      required
                      value={c.price / 100}
                      onChange={(e) =>
                        changeChoice(g, c.id, (x) => ({
                          ...x,
                          price: Math.round(Number(e.target.value) * 100),
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="line">
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={c.active}
                      onChange={(e) =>
                        changeChoice(g, c.id, (x) => ({
                          ...x,
                          active: e.target.checked,
                        }))
                      }
                    />
                    Disponible
                  </label>
                  <button
                    type="button"
                    className="danger-link"
                    onClick={() =>
                      changeGroup(g.id, (x) => ({
                        ...x,
                        choices: x.choices.filter((y) => y.id !== c.id),
                      }))
                    }
                  >
                    Quitar opción
                  </button>
                </div>
                <details>
                  <summary>Insumos de esta opción</summary>
                  <div className="ingredient-checks">
                    {ingredients.map((i) => (
                      <label key={i.id}>
                        <input
                          type="checkbox"
                          checked={(c.ingredientIds || []).includes(i.id)}
                          onChange={(e) =>
                            changeChoice(g, c.id, (x) => ({
                              ...x,
                              ingredientIds: e.target.checked
                                ? [...(x.ingredientIds || []), i.id]
                                : (x.ingredientIds || []).filter(
                                    (id) => id !== i.id,
                                  ),
                            }))
                          }
                        />
                        {i.name}
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            ))}
            <button
              type="button"
              className="secondary full"
              onClick={() =>
                changeGroup(g.id, (x) => ({
                  ...x,
                  choices: [
                    ...x.choices,
                    {
                      id: crypto.randomUUID(),
                      label: "",
                      price: 0,
                      active: true,
                      ingredientIds: [],
                    },
                  ],
                }))
              }
            >
              + Agregar opción
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="secondary full"
          disabled={groups.length >= 8}
          onClick={() =>
            setGroups((g) => [
              ...g,
              {
                id: crypto.randomUUID(),
                name: "",
                min: 0,
                max: 1,
                choices: [
                  {
                    id: crypto.randomUUID(),
                    label: "",
                    price: 0,
                    active: true,
                    ingredientIds: [],
                  },
                ],
              },
            ])
          }
        >
          + Agregar grupo de opciones
        </button>
        <p className="muted">
          Un grupo de tamaño o salsa puede exigir una opción. Extras puede
          permitir varias.
        </p>
        <button className="primary full" disabled={busy}>
          {busy ? "Guardando…" : "Guardar opciones e insumos"}
        </button>
      </form>
    </Modal>
  );
}
