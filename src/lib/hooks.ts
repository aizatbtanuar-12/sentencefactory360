import { useEffect, useRef, useState } from 'react';

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Calls onIdle after `ms` with no touches, clicks or key presses. */
export function useIdle(ms: number, onIdle: () => void, enabled = true) {
  const cb = useRef(onIdle);
  cb.current = onIdle;
  useEffect(() => {
    if (!enabled) return;
    let t = window.setTimeout(() => cb.current(), ms);
    const reset = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => cb.current(), ms);
    };
    const evs = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(t);
      evs.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [ms, enabled]);
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function formatSecs(ms: number | null | undefined): string {
  const s = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
