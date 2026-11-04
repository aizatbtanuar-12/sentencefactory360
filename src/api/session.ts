// Teacher session token. Kept in sessionStorage so it disappears when the tab is closed.
const KEY = 'sf360.teacher';

type Listener = (signedIn: boolean) => void;
const listeners = new Set<Listener>();

export function getToken(): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const { token, expires_at } = JSON.parse(raw) as { token: string; expires_at: number };
    if (Date.now() > expires_at) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function setToken(token: string, expires_at: number) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ token, expires_at }));
  } catch {
    /* storage unavailable: the session just won't survive a reload */
  }
  listeners.forEach((l) => l(true));
}

export function clearToken() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(false));
}

export function onSessionChange(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
