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
      Authorization: "Bearer " + (sessionStorage.getItem("staffToken") || ""),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    throw Error(b.error || "No se pudo completar la solicitud");
  }
  return r.json();
}
export const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
export const dayOf = (d) =>
  new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
