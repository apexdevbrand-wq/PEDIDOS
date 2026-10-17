import { useEffect, useRef, useState } from "react";
// Dentro de la app Android (Capacitor) existe el plugin nativo KitchenAlarm,
// que suena por el canal de alarma a volumen máximo. En el navegador se usa Web Audio.
function nativeAlarm() {
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.KitchenAlarm || cap.registerPlugin?.("KitchenAlarm") || null;
}
export default function useKitchenSound(orders) {
  const [enabled, setEnabled] = useState(false),
    [ringing, setRinging] = useState(false),
    [message, setMessage] = useState(""),
    audio = useRef(null),
    native = useRef(nativeAlarm()),
    repeat = useRef(null),
    previous = useRef(null);
  function beep() {
    const ctx = audio.current;
    if (!ctx) return;
    for (const offset of [0, 0.25]) {
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(
        0.15,
        ctx.currentTime + offset + 0.02,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + offset + 0.18,
      );
      oscillator.start(ctx.currentTime + offset);
      oscillator.stop(ctx.currentTime + offset + 0.2);
    }
  }
  function ring() {
    setRinging(true);
    if (native.current) {
      native.current.start().catch((e) => setMessage(e.message));
      return;
    }
    beep();
    clearInterval(repeat.current);
    repeat.current = setInterval(beep, 3000);
  }
  function silence() {
    setRinging(false);
    clearInterval(repeat.current);
    repeat.current = null;
    native.current?.stop().catch(() => {});
  }
  useEffect(() => {
    const ids = new Set(orders.map((o) => o.id));
    if (
      enabled &&
      previous.current &&
      orders.some((o) => o.status === "pending" && !previous.current.has(o.id))
    )
      ring();
    else if (ringing && !orders.some((o) => o.status === "pending")) silence();
    previous.current = ids;
  }, [orders, enabled]);
  useEffect(
    () => () => {
      silence();
      native.current?.keepAwake({ enabled: false }).catch(() => {});
      audio.current?.close();
    },
    [],
  );
  async function toggle() {
    try {
      if (enabled) {
        silence();
        await native.current?.keepAwake({ enabled: false });
        await audio.current?.close();
        audio.current = null;
        setEnabled(false);
        return;
      }
      if (native.current) {
        await native.current.keepAwake({ enabled: true });
        await native.current.start();
        setTimeout(() => native.current.stop().catch(() => {}), 1500);
        setEnabled(true);
        setMessage(
          "Alarma activada a volumen máximo. Mantén la app abierta; la pantalla no se apagará.",
        );
        return;
      }
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw Error("El navegador no admite sonido.");
      audio.current = new Audio();
      await audio.current.resume();
      setEnabled(true);
      beep();
      setMessage("Sonido activado. Mantén Cocina abierta.");
    } catch (e) {
      setMessage(e.message);
    }
  }
  return { enabled, ringing, message, toggle, silence };
}
