export const money = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    n / 100,
  );
export const labels = {
  pending: "Pendiente",
  cooking: "En cocina",
  ready: "Listo / En camino",
  completed: "Entregado",
  rejected: "Rechazado",
};
export async function api(path, method = "GET", body) {
  const r = await fetch("/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    const error = new Error(b.error || "No se pudo completar la solicitud");
    error.status = r.status;
    throw error;
  }
  return r.json();
}
export const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
export const dayOf = (d) =>
  new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
