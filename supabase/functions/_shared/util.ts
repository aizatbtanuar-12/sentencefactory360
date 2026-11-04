// Shared server helpers for the Sentence Factory Edge Functions.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const BUCKET = 'submissions';

// ---------------------------------------------------------------- CORS
export function corsHeaders(req: Request): Record<string, string> {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.get('origin') ?? '';
  const allowOrigin = allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-teacher-token',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return json(req, { error: e.message }, e.status);
      console.error(e);
      return json(req, { error: 'Something went wrong on the server. Please try again.' }, 500);
    }
  });
}

// ---------------------------------------------------------------- Supabase admin client (server only)
let _admin: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  if (!_admin) {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new HttpError(500, 'Server is missing Supabase configuration.');
    _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return _admin;
}

export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) {
    console.error(res.error);
    throw new HttpError(500, 'Database error. Please try again.');
  }
  return res.data;
}

// ---------------------------------------------------------------- Encoding / crypto
const enc = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

export function randomToken(bytes = 24): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));
}

export async function sha256(s: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))));
}

// ---------------------------------------------------------------- PIN hashing (PBKDF2-SHA256)
const PBKDF2_ITER = 150_000;

async function pbkdf2(pin: string, salt: Uint8Array<ArrayBuffer>, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const h = await pbkdf2(pin, salt, PBKDF2_ITER);
  return `pbkdf2$${PBKDF2_ITER}$${b64url(salt)}$${b64url(h)}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [alg, iter, salt, hash] = stored.split('$');
  if (alg !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const h = await pbkdf2(pin, fromB64url(salt), Number(iter));
  return safeEqual(b64url(h), hash);
}

export const PIN_RE = /^\d{4,8}$/;

// ---------------------------------------------------------------- Teacher session tokens (HMAC signed)
function sessionSecret(): string {
  const s = Deno.env.get('TEACHER_SESSION_SECRET') ?? '';
  if (s.length < 24 || s.startsWith('CHANGE-ME')) {
    throw new HttpError(500, 'TEACHER_SESSION_SECRET is not configured on the server.');
  }
  return s;
}

export interface SessionPayload {
  sub: string; // teacher id
  exp: number; // unix seconds
  pv: string; // fingerprint of the PIN hash — changing the PIN signs everyone out
}

export async function signSession(p: SessionPayload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(p)));
  return `${body}.${await hmac(sessionSecret(), body)}`;
}

export async function readSession(token: string | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  if (!safeEqual(sig, await hmac(sessionSecret(), body))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    if (typeof p.sub !== 'string' || !p.sub || typeof p.exp !== 'number' || p.exp < Date.now() / 1000) return null;
    return p;
  } catch {
    return null;
  }
}

export async function pinFingerprint(pinHash: string | null): Promise<string> {
  return (await sha256(pinHash ?? 'initial-pin')).slice(0, 12);
}

// ---------------------------------------------------------------- Misc
export function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TeacherRow {
  id: string;
  title: string;
  name: string;
  school: string | null;
  subject: string | null;
  welcome_message: string | null;
  photo_path: string | null;
  pin_hash: string | null;
  is_admin: boolean;
  photo_required: boolean;
  word_of_day: unknown;
  challenge: unknown;
  created_at: string;
}

export const displayName = (t: { title: string; name: string }) => `${t.title} ${t.name}`.trim();

/** Short-lived signed URLs for a set of storage paths (missing paths are skipped). */
export async function signUrls(paths: (string | null | undefined)[], seconds = 3600): Promise<Map<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  const map = new Map<string, string>();
  if (!list.length) return map;
  const { data, error } = await admin().storage.from(BUCKET).createSignedUrls(list, seconds);
  if (error) console.error(error);
  for (const d of data ?? []) if (d.path && d.signedUrl) map.set(d.path, d.signedUrl);
  return map;
}

/** Public-safe view of a teacher (never includes the PIN hash). */
export function publicTeacher(t: TeacherRow, urls: Map<string, string>) {
  return {
    id: t.id,
    title: t.title,
    name: t.name,
    display_name: displayName(t),
    school: t.school,
    subject: t.subject,
    welcome_message: t.welcome_message,
    photo_url: t.photo_path ? urls.get(t.photo_path) ?? null : null,
    is_admin: t.is_admin,
  };
}
