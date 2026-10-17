import React, { useEffect, useState, useRef } from "react";
import { api, money, today } from "../api";
export default function CashPanel({ catalog, orders, run }) {
  const [date, setDate] = useState(() =>
      new Date().toLocaleDateString("en-CA", {
        timeZone: catalog.settings.timezone,
      }),
    ),
    [report, setReport] = useState(null),
    [closures, setClosures] = useState([]),
    [counted, setCounted] = useState(""),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  async function load() {
    const [r, c] = await Promise.all([
      api("/staff/reports?date=" + date),
      api("/staff/closures"),
    ]);
    setReport(r);
    setClosures(c);
  }
  useEffect(() => {
    run(load);
  }, [date, orders]);
  return (
    <>
      <div className="section-title">
        <div>
          <h2>Ventas y corte de caja</h2>
          <p className="muted">
            Cobros por fecha de pago · {catalog.settings.timezone}
          </p>
        </div>
        <label>
          Fecha
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>
      {report && (
        <>
          <div className="metrics">
            {[
              ["Total cobrado", report.grossCollected],
              ["Reembolsos registrados", report.refundedTotal],
              ["Neto cobrado", report.netCollected],
              ["Efectivo cobrado", report.cashCollected],
              ["Transferencias", report.transferCollected || 0],
              ["Mercado Pago cobrado", report.mpCollected],
              ["Productos", report.productRevenue],
              ["Envíos", report.shippingCollected],
              ["Recargos MP", report.surchargeCollected],
              ["Reembolsos por gestionar", report.refundRequired],
              ["Pendiente de cobro", report.pendingTotal],
            ].map(([label, value]) => (
              <article key={label}>
                <small>{label}</small>
                <h2>{money(value)}</h2>
              </article>
            ))}
          </div>
          <div className="admin-grid">
            <section className="panel">
              <div className="line">
                <h2>Detalle del día</h2>
                <a
                  className="text-button"
                  href={"/api/staff/reports?date=" + date + "&format=csv"}
                >
                  Descargar CSV
                </a>
              </div>
              <p className="muted">
                {report.paidCount} pedidos cobrados · {report.rejectedCount}{" "}
                rechazados. El total cobrado incluye dinero retenido que aún
                requiere reembolso.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Folio</th>
                      <th>Pago</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.orders.map((o) => (
                      <tr key={o.folio}>
                        <td>{o.folio}</td>
                        <td>
                          {o.payment === "cash" ? "Efectivo" : o.payment === "transfer" ? "Transferencia" : "MP"}
                          {o.status === "rejected" ? " · Rechazado" : ""}
                        </td>
                        <td>{money(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!report.orders.length && (
                <p className="muted">Todavía no hay cobros en esta fecha.</p>
              )}
              <h3>Pedidos por colonia</h3>
              {catalog.zones.map((z) => (
                <div className="line colony-line" key={z.id}>
                  <span>{z.name}</span>
                  <b>
                    {report.zones?.[z.id] ?? 0}
                  </b>
                </div>
              ))}
            </section>
            <section className="panel">
              <h2>Cerrar caja</h2>
              <p className="muted">
                Incluye cobros desde el último corte, aunque sean de otro día.
                El corte conserva una fotografía de los importes y no elimina
                pedidos.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (busy) return;
                  setBusy(true);
                  const result = await run(() =>
                    api("/staff/closures", "POST", {
                      countedCash: Math.round(Number(counted) * 100),
                      notes,
                      requestId: key.current,
                    }),
                  );
                  if (result) {
                    key.current = crypto.randomUUID();
                    setCounted("");
                    setNotes("");
                    await run(load);
                  }
                  setBusy(false);
                }}
              >
                <label>
                  Efectivo contado (MXN)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                  />
                </label>
                <label>
                  Notas del corte
                  <textarea
                    maxLength={500}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <button className="primary full" disabled={busy}>
                  {busy ? "Cerrando…" : "Guardar corte de caja"}
                </button>
              </form>
              {closures.slice(0, 8).map((c) => (
                <article className="closure" key={c.id}>
                  <b>
                    {new Date(c.to).toLocaleString("es-MX", {
                      timeZone: catalog.settings.timezone,
                    })}
                  </b>
                  <small>Realizado por {c.actor}</small>
                  <div className="line">
                    <span>Efectivo esperado</span>
                    <b>{money(c.cashCollected)}</b>
                  </div>
                  <div className="line">
                    <span>Contado</span>
                    <b>{money(c.countedCash)}</b>
                  </div>
                  <div className="line">
                    <span>Diferencia</span>
                    <b className={c.difference ? "stock-warning" : "success"}>
                      {money(c.difference)}
                    </b>
                  </div>
                  {c.notes && <p>{c.notes}</p>}
                </article>
              ))}
            </section>
          </div>
        </>
      )}
    </>
  );
}
