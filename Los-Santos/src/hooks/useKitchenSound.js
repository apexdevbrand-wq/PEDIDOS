import { useCallback, useEffect, useRef, useState } from "react";

// Alarma de pedidos nuevos.
// - APK (Capacitor): reproduce por el canal de ALARMA de Android al volumen máximo
//   (plugin nativo KitchenAlarm) y mantiene la pantalla encendida.
// - Navegador: reproduce /sounds/pedido.wav en bucle y pide "wake lock".
// Suena mientras haya un pedido ACCIONABLE sin aceptar (efectivo, o pago confirmado)
// y se puede silenciar; vuelve a sonar con cada pedido nuevo y cada 90 s si sigue pendiente.
const REMIND_MS = 90_000;
// App Android de Cocina (android-app/): plugin nativo KitchenAlarm.
// OrderAlarm es el nombre que usaba la versión 2; se acepta por compatibilidad.
const native = () => {
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.KitchenAlarm || cap.Plugins?.OrderAlarm || null;
};
export const isNativeApp = () => !!window.Capacitor?.isNativePlatform?.();
const actionable = (o) =>
  // Efectivo y transferencia suenan al llegar (la transferencia hay que revisarla);
  // Mercado Pago solo cuando el pago ya está confirmado.
  o.status === "pending" && (o.payment !== "mp" || o.paymentStatus === "paid");

export default function useKitchenSound(orders) {
  const [enabled, setEnabled] = useState(isNativeApp()),
    [ringing, setRinging] = useState(false),
    [message, setMessage] = useState(""),
    audio = useRef(null),
    wake = useRef(null),
    silenced = useRef(new Set()),
    [tick, setTick] = useState(0);

  const pending = orders.filter(actionable);
  const shouldRing =
    enabled && pending.some((o) => !silenced.current.has(o.id));

  const play = useCallback(async () => {
    if (native()) return native().start();
    if (!audio.current) return;
    audio.current.loop = true;
    audio.current.volume = 1;
    await audio.current.play();
  }, []);
  const stop = useCallback(async () => {
    if (native()) await native().stop().catch(() => {});
    if (audio.current) {
      audio.current.pause();
      audio.current.currentTime = 0;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (shouldRing) {
      play()
        .then(() => !cancelled && setRinging(true))
        .catch(() => {
          setMessage("El navegador bloqueó el sonido. Pulsa «Activar alarma».");
          setEnabled(false);
        });
    } else {
      stop();
      setRinging(false);
    }
    return () => {
      cancelled = true;
    };
  }, [shouldRing, play, stop, tick]);

  // Recordatorio si alguien silenció y el pedido sigue sin aceptarse.
  useEffect(() => {
    if (!pending.length || !silenced.current.size) return;
    const t = setTimeout(() => {
      silenced.current = new Set();
      setTick((n) => n + 1);
    }, REMIND_MS);
    return () => clearTimeout(t);
  }, [pending.length, tick]);

  // Olvida pedidos que ya no están pendientes.
  useEffect(() => {
    const ids = new Set(pending.map((o) => o.id));
    for (const id of silenced.current) if (!ids.has(id)) silenced.current.delete(id);
  }, [orders]);

  async function keepAwake(on) {
    try {
      if (native()) return await native().keepAwake({ enabled: on });
      if (on && "wakeLock" in navigator) {
        wake.current = await navigator.wakeLock.request("screen");
      } else {
        await wake.current?.release();
        wake.current = null;
      }
    } catch {
      /* no disponible: no es crítico */
    }
  }
  // El wake lock web se pierde al ocultar la pestaña: se pide de nuevo al volver.
  useEffect(() => {
    if (!enabled) return;
    const again = () => document.visibilityState === "visible" && keepAwake(true);
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, [enabled]);

  useEffect(() => {
    if (isNativeApp()) keepAwake(true); // la tablet de cocina no debe apagar la pantalla
    return () => {
      stop();
      keepAwake(false);
    };
  }, []);

  async function toggle() {
    if (enabled && !isNativeApp()) {
      await stop();
      await keepAwake(false);
      setEnabled(false);
      setRinging(false);
      setMessage("Alarma desactivada.");
      return;
    }
    try {
      if (!native()) {
        audio.current ||= new Audio("/sounds/pedido.wav");
        // Prueba audible de ~2 s: también autoriza el audio en este navegador.
        audio.current.loop = false;
        audio.current.volume = 1;
        await audio.current.play();
      } else {
        await native().start();
        setTimeout(() => native().stop().catch(() => {}), 2200);
      }
      await keepAwake(true);
      setEnabled(true);
      setMessage(
        native()
          ? "Alarma activada. Suena aunque el volumen esté bajo."
          : "Alarma activada. Mantén esta pantalla abierta y el volumen alto.",
      );
    } catch (e) {
      setMessage("No se pudo activar el sonido: " + (e.message || e));
    }
  }
  function silence() {
    for (const o of pending) silenced.current.add(o.id);
    setTick((n) => n + 1);
  }
  return { enabled, ringing, message, toggle, silence, pending: pending.length };
}
