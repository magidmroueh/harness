import { useEffect, useRef } from "react";

let sharedCtx: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AudioContext();
  }
  if (sharedCtx.state === "suspended") {
    sharedCtx.resume();
  }
  return sharedCtx;
}

function playChime() {
  try {
    const ctx = getAudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.setValueAtTime(880, ctx.currentTime);
    o1.connect(gain);
    o1.start(ctx.currentTime);
    o1.stop(ctx.currentTime + 0.08);

    const gain2 = ctx.createGain();
    gain2.connect(ctx.destination);
    gain2.gain.setValueAtTime(0.08, ctx.currentTime + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);
    o2.connect(gain2);
    o2.start(ctx.currentTime + 0.08);
    o2.stop(ctx.currentTime + 0.2);
  } catch {
    // Web Audio not available
  }
}

/**
 * Plays a synthesized chime when unread count increases.
 * Throttled to once per 3 seconds.
 */
export function useNotificationSound(unreadCount: number, enabled = true) {
  const lastPlayedRef = useRef(0);
  const prevCountRef = useRef(unreadCount);

  useEffect(() => {
    if (!enabled || unreadCount <= prevCountRef.current) {
      prevCountRef.current = unreadCount;
      return;
    }
    prevCountRef.current = unreadCount;

    const now = Date.now();
    if (now - lastPlayedRef.current < 3000) return;
    lastPlayedRef.current = now;

    playChime();
  }, [unreadCount, enabled]);
}
