// =====================================================================
//  Sentence Factory 360° — Edge Function "teacher" (single-file version)
//  For pasting into Supabase Dashboard → Edge Functions → Deploy a new
//  function → Via Editor. Name the function exactly:  teacher
//  Then turn OFF "Enforce JWT verification" for it.
//  (Generated from supabase/functions/teacher/index.ts + _shared/*.ts)
// =====================================================================

// ---------- shared: util.ts ----------
// Shared server helpers for the Sentence Factory Edge Functions.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'submissions';

// ---------------------------------------------------------------- CORS
function corsHeaders(req: Request): Record<string, string> {
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

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function serve(handler: (req: Request) => Promise<Response>) {
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
function admin(): SupabaseClient {
  if (!_admin) {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new HttpError(500, 'Server is missing Supabase configuration.');
    _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return _admin;
}

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) {
    console.error(res.error);
    throw new HttpError(500, 'Database error. Please try again.');
  }
  return res.data;
}

// ---------------------------------------------------------------- Encoding / crypto
const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

function randomToken(bytes = 24): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

function safeEqual(a: string, b: string): boolean {
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

async function sha256(s: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))));
}

// ---------------------------------------------------------------- PIN hashing (PBKDF2-SHA256)
const PBKDF2_ITER = 150_000;

async function pbkdf2(pin: string, salt: Uint8Array<ArrayBuffer>, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return new Uint8Array(bits);
}

async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const h = await pbkdf2(pin, salt, PBKDF2_ITER);
  return `pbkdf2$${PBKDF2_ITER}$${b64url(salt)}$${b64url(h)}`;
}

async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [alg, iter, salt, hash] = stored.split('$');
  if (alg !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const h = await pbkdf2(pin, fromB64url(salt), Number(iter));
  return safeEqual(b64url(h), hash);
}

const PIN_RE = /^\d{4,8}$/;

// ---------------------------------------------------------------- Teacher session tokens (HMAC signed)
function sessionSecret(): string {
  const s = Deno.env.get('TEACHER_SESSION_SECRET') ?? '';
  if (s.length < 24 || s.startsWith('CHANGE-ME')) {
    throw new HttpError(500, 'TEACHER_SESSION_SECRET is not configured on the server.');
  }
  return s;
}

interface SessionPayload {
  sub: 'teacher';
  exp: number; // unix seconds
  pv: string; // fingerprint of the PIN hash — changing the PIN signs everyone out
}

async function signSession(p: SessionPayload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(p)));
  return `${body}.${await hmac(sessionSecret(), body)}`;
}

async function readSession(token: string | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  if (!safeEqual(sig, await hmac(sessionSecret(), body))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    if (p.sub !== 'teacher' || typeof p.exp !== 'number' || p.exp < Date.now() / 1000) return null;
    return p;
  } catch {
    return null;
  }
}

async function pinFingerprint(pinHash: string | null): Promise<string> {
  return (await sha256(pinHash ?? 'initial-pin')).slice(0, 12);
}

// ---------------------------------------------------------------- Misc
function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

// ---------- shared: sentence.ts ----------

// ---------- function ----------
// Teacher endpoint. Every action except `login` requires a valid signed session
// (sent in the `x-teacher-token` header). The PIN is checked here on the server.

const SESSION_HOURS = 8;
const SIGNED_URL_SECONDS = 60 * 60; // photos/audio links for the dashboard last 1 hour; QR codes never use these
const FAIL_WINDOW_MIN = 15;
const MAX_FAILS_PER_IP = 8;
const MAX_FAILS_GLOBAL = 40;

type Row = Record<string, unknown> & {
  id: string;
  photo_path: string | null;
  audio_path: string;
  status: string;
  share_token: string | null;
};

const LIST_COLS =
  'id, pupil_name, class_name, sentence, who, what_happens, where_text, when_text, status, created_at, reviewed_at, audio_duration_ms, challenge_done, used_word_of_day, share_token, photo_path, audio_path, audio_mime';

async function getSettings() {
  return must(await admin().from('app_settings').select('*').eq('id', 1).single()) as {
    classroom_name: string;
    teacher_pin_hash: string | null;
    photo_required: boolean;
    word_of_day: unknown;
    challenge: unknown;
  };
}

function checkPin(pin: string, pinHash: string | null): Promise<boolean> {
  if (pinHash) return verifyPin(pin, pinHash);
  const initial = Deno.env.get('INITIAL_TEACHER_PIN') ?? '';
  if (!PIN_RE.test(initial)) throw new HttpError(500, 'INITIAL_TEACHER_PIN is not configured on the server (4–8 digits).');
  return Promise.resolve(safeEqual(pin, initial));
}

async function withUrls(rows: Row[], opts: { photo?: boolean; audio?: boolean }) {
  const store = admin().storage.from(BUCKET);
  const paths = rows.flatMap((r) => [opts.photo ? r.photo_path : null, opts.audio ? r.audio_path : null]).filter(
    (p): p is string => !!p,
  );
  const map = new Map<string, string>();
  if (paths.length) {
    const { data, error } = await store.createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (error) console.error(error);
    for (const d of data ?? []) if (d.path && d.signedUrl) map.set(d.path, d.signedUrl);
  }
  return rows.map((r) => {
    const { photo_path, audio_path, ...rest } = r;
    return {
      ...rest,
      has_photo: !!photo_path,
      photo_url: photo_path ? map.get(photo_path) ?? null : null,
      audio_url: opts.audio ? map.get(audio_path) ?? null : null,
    };
  });
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
  const body = await req.json().catch(() => ({}));
  const action = str(body.action, 30);
  const db = admin();

  // ------------------------------------------------------------ login
  if (action === 'login') {
    const ip = clientIp(req);
    const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60_000).toISOString();
    const { count: ipCount } = await db
      .from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('success', false)
      .gte('created_at', since);
    const { count: allCount } = await db
      .from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('success', false)
      .gte('created_at', since);
    if ((ipCount ?? 0) >= MAX_FAILS_PER_IP || (allCount ?? 0) >= MAX_FAILS_GLOBAL) {
      throw new HttpError(429, `Too many wrong PINs. Please wait ${FAIL_WINDOW_MIN} minutes and try again.`);
    }
    const pin = str(body.pin, 8);
    const settings = await getSettings();
    const ok = PIN_RE.test(pin) && (await checkPin(pin, settings.teacher_pin_hash));
    await db.from('login_attempts').insert({ ip, success: ok });
    if (!ok) throw new HttpError(401, 'Wrong PIN. Please try again.');
    const exp = Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600;
    const token = await signSession({ sub: 'teacher', exp, pv: await pinFingerprint(settings.teacher_pin_hash) });
    // tidy old attempts
    await db.from('login_attempts').delete().lt('created_at', new Date(Date.now() - 7 * 86400_000).toISOString());
    return json(req, { token, expires_at: exp * 1000, using_initial_pin: !settings.teacher_pin_hash });
  }

  // ------------------------------------------------------------ everything else needs a session
  const session = await readSession(req.headers.get('x-teacher-token'));
  const settings = await getSettings();
  if (!session || session.pv !== (await pinFingerprint(settings.teacher_pin_hash))) {
    throw new HttpError(401, 'Your teacher session has ended. Please enter your PIN again.');
  }

  switch (action) {
    case 'session':
      return json(req, { ok: true, using_initial_pin: !settings.teacher_pin_hash });

    case 'stats': {
      const count = async (status?: string) => {
        let q = db.from('submissions').select('id', { count: 'exact', head: true });
        if (status) q = q.eq('status', status);
        const { count, error } = await q;
        if (error) throw new HttpError(500, 'Database error.');
        return count ?? 0;
      };
      const [total, pending, approved, rejected] = await Promise.all([
        count(),
        count('pending'),
        count('approved'),
        count('rejected'),
      ]);
      return json(req, { total, pending, approved, rejected });
    }

    case 'list': {
      let q = db.from('submissions').select(LIST_COLS).order('created_at', { ascending: false }).limit(1000);
      const status = str(body.status, 10);
      const cls = str(body.class_name, 40);
      if (['pending', 'approved', 'rejected'].includes(status)) q = q.eq('status', status);
      if (cls) q = q.eq('class_name', cls);
      const rows = must(await q) as unknown as Row[];
      return json(req, { submissions: await withUrls(rows, { photo: !!body.with_photos }) });
    }

    case 'get': {
      const row = must(await db.from('submissions').select(LIST_COLS).eq('id', str(body.id, 36)).maybeSingle()) as Row | null;
      if (!row) throw new HttpError(404, 'Submission not found.');
      return json(req, { submission: (await withUrls([row], { photo: true, audio: true }))[0] });
    }

    case 'set_status': {
      const id = str(body.id, 36);
      const status = str(body.status, 10);
      if (!['pending', 'approved', 'rejected'].includes(status)) throw new HttpError(400, 'Invalid status.');
      const row = must(await db.from('submissions').select('id, share_token').eq('id', id).maybeSingle()) as
        | { id: string; share_token: string | null }
        | null;
      if (!row) throw new HttpError(404, 'Submission not found.');
      // The share token is created once and kept, so a printed QR code keeps working if the card is re-approved.
      const patch: Record<string, unknown> = { status, reviewed_at: new Date().toISOString() };
      if (status === 'approved' && !row.share_token) patch.share_token = randomToken(24);
      must(await db.from('submissions').update(patch).eq('id', id));
      return json(req, { ok: true });
    }

    case 'delete': {
      const id = str(body.id, 36);
      const row = must(await db.from('submissions').select('photo_path, audio_path').eq('id', id).maybeSingle()) as
        | { photo_path: string | null; audio_path: string }
        | null;
      if (!row) return json(req, { ok: true });
      const paths = [row.photo_path, row.audio_path].filter((p): p is string => !!p);
      if (paths.length) await db.storage.from(BUCKET).remove(paths);
      must(await db.from('submissions').delete().eq('id', id));
      return json(req, { ok: true });
    }

    case 'gallery':
    case 'cards': {
      let q = db.from('submissions').select(LIST_COLS).eq('status', 'approved').order('class_name').order('pupil_name');
      const cls = str(body.class_name, 40);
      if (cls) q = q.eq('class_name', cls);
      if (Array.isArray(body.ids) && body.ids.length) q = q.in('id', body.ids.slice(0, 100).map((x: unknown) => str(x, 36)));
      const rows = must(await q) as unknown as Row[];
      return json(req, { submissions: await withUrls(rows, { photo: true, audio: action === 'gallery' }) });
    }

    // -------------------------------------------------------- settings
    case 'get_settings': {
      const classes = must(await db.from('classes').select('id, name, access_code').order('name'));
      const words = must(
        await db.from('word_bank').select('id, category, text, is_plural, sort_order').order('sort_order').order('text'),
      );
      return json(req, {
        classroom_name: settings.classroom_name,
        photo_required: settings.photo_required,
        word_of_day: settings.word_of_day,
        challenge: settings.challenge,
        using_initial_pin: !settings.teacher_pin_hash,
        classes,
        words,
      });
    }

    case 'update_settings': {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body.classroom_name === 'string') {
        const n = str(body.classroom_name, 60);
        if (!n) throw new HttpError(400, 'Classroom name cannot be empty.');
        patch.classroom_name = n;
      }
      if (typeof body.photo_required === 'boolean') patch.photo_required = body.photo_required;
      if ('word_of_day' in body) {
        const w = body.word_of_day;
        patch.word_of_day =
          w && str(w.word, 30)
            ? { word: str(w.word, 30), meaning: str(w.meaning, 120) || null, date: new Date().toISOString().slice(0, 10) }
            : null;
      }
      if ('challenge' in body) {
        const c = body.challenge;
        const mw = Number(c?.min_words);
        patch.challenge =
          c && str(c.title, 100)
            ? {
                title: str(c.title, 100),
                required_word: str(c.required_word, 30) || null,
                min_words: Number.isFinite(mw) && mw > 0 ? Math.min(30, Math.floor(mw)) : null,
              }
            : null;
      }
      must(await db.from('app_settings').update(patch).eq('id', 1));
      return json(req, { ok: true });
    }

    case 'class_add':
    case 'class_update': {
      const name = str(body.name, 40);
      const code = str(body.access_code, 20).toUpperCase().replace(/\s/g, '');
      if (!name) throw new HttpError(400, 'Please enter a class name.');
      if (code.length < 4) throw new HttpError(400, 'The access code needs at least 4 letters or numbers.');
      const res =
        action === 'class_add'
          ? await db.from('classes').insert({ name, access_code: code })
          : await db.from('classes').update({ name, access_code: code }).eq('id', str(body.id, 36));
      if (res.error) throw new HttpError(res.error.code === '23505' ? 409 : 500, res.error.code === '23505' ? 'That class already exists.' : 'Could not save the class.');
      return json(req, { ok: true });
    }

    case 'class_delete': {
      must(await db.from('classes').delete().eq('id', str(body.id, 36)));
      return json(req, { ok: true });
    }

    case 'word_add': {
      const category = str(body.category, 10);
      if (!['who', 'what', 'where', 'when'].includes(category)) throw new HttpError(400, 'Invalid category.');
      const text = str(body.text, 60).replace(/[.!?]+$/, '');
      if (!text) throw new HttpError(400, 'Please type a word or phrase.');
      const { data: last } = await db
        .from('word_bank')
        .select('sort_order')
        .eq('category', category)
        .order('sort_order', { ascending: false })
        .limit(1);
      const res = await db.from('word_bank').insert({
        category,
        text,
        is_plural: category === 'who' ? !!body.is_plural : false,
        sort_order: ((last?.[0]?.sort_order as number | undefined) ?? 0) + 1,
      });
      if (res.error) throw new HttpError(res.error.code === '23505' ? 409 : 500, res.error.code === '23505' ? 'That word is already in the word bank.' : 'Could not add the word.');
      return json(req, { ok: true });
    }

    case 'word_delete': {
      must(await db.from('word_bank').delete().eq('id', str(body.id, 36)));
      return json(req, { ok: true });
    }

    case 'change_pin': {
      const current = str(body.current_pin, 8);
      const next = str(body.new_pin, 8);
      if (!PIN_RE.test(next)) throw new HttpError(400, 'The new PIN must be 4 to 8 digits.');
      if (!(PIN_RE.test(current) && (await checkPin(current, settings.teacher_pin_hash)))) {
        throw new HttpError(401, 'Your current PIN is not right.');
      }
      const hash = await hashPin(next);
      must(await db.from('app_settings').update({ teacher_pin_hash: hash, updated_at: new Date().toISOString() }).eq('id', 1));
      const exp = Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600;
      const token = await signSession({ sub: 'teacher', exp, pv: await pinFingerprint(hash) });
      return json(req, { ok: true, token, expires_at: exp * 1000 });
    }

    default:
      throw new HttpError(400, 'Unknown action.');
  }
});
