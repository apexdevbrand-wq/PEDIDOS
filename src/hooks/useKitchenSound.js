import { useEffect, useRef, useState } from "react";
export default function useKitchenSound(orders) {
  const [enabled, setEnabled] = useState(false),
    [message, setMessage] = useState(""),
    audio = useRef(null),
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
  useEffect(() => {
    const ids = new Set(orders.map((o) => o.id));
    if (
      enabled &&
      previous.current &&
      orders.some((o) => o.status === "pending" && !previous.current.has(o.id))
    )
      beep();
    previous.current = ids;
  }, [orders, enabled]);
  useEffect(
    () => () => {
      audio.current?.close();
    },
    [],
  );
  async function toggle() {
    try {
      if (enabled) {
        await audio.current?.close();
        audio.current = null;
        setEnabled(false);
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
  return { enabled, message, toggle };
}
