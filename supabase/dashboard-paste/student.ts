// =====================================================================
//  Sentence Factory 360° — Edge Function "student" (single-file version)
//  For pasting into Supabase Dashboard → Edge Functions → Deploy a new
//  function → Via Editor. Name the function exactly:  student
//  Then turn OFF "Enforce JWT verification" for it.
//  (Generated from supabase/functions/student/index.ts + _shared/*.ts)
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
// Shared sentence logic (server copy).
// NOTE: an identical copy lives in src/lib/sentence.ts so the browser previews
// the same sentence the server saves. If you change one, copy it to the other.

type Category = 'who' | 'what' | 'where' | 'when';

const CATEGORIES: Category[] = ['who', 'what', 'where', 'when'];

interface WordItem {
  id: string;
  category: Category;
  text: string;
  is_plural: boolean;
  sort_order: number;
}

interface SentenceParts {
  who: string;
  what: string;
  where: string;
  when: string;
}

interface Challenge {
  title: string;
  required_word?: string | null;
  min_words?: number | null;
}

interface WordOfDay {
  word: string;
  meaning?: string | null;
  date?: string | null;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[.!?,;:]+$/, '');

/** Join the four parts into one sentence with a capital letter and a full stop. */
function buildSentence(p: Partial<SentenceParts>): string {
  const words = [p.who, p.what, p.where, p.when].map((x) => clean(x ?? '')).filter(Boolean);
  if (!words.length) return '';
  let s = words.join(' ');
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s + '.';
}

function countWords(s: string): number {
  return s.split(/\s+/).filter((w) => /[a-z]/i.test(w)).length;
}

/** The helping verb at the start of a WHAT phrase, if any. */
function leadingVerb(what: string): 'is' | 'are' | 'was' | 'were' | null {
  const m = clean(what).toLowerCase().match(/^(is|are|was|were)\b/);
  return (m?.[1] as 'is' | 'are' | 'was' | 'were') ?? null;
}

/** Does WHO agree with the helping verb in WHAT? (null = nothing to check) */
function agreementOk(what: string, whoIsPlural: boolean): boolean | null {
  const v = leadingVerb(what);
  if (!v) return null;
  const plural = v === 'are' || v === 'were';
  return plural === whoIsPlural;
}

/** Swap is↔are / was↔were so WHAT agrees with WHO. */
function fixAgreement(what: string, whoIsPlural: boolean): string {
  const t = clean(what);
  const v = leadingVerb(t);
  if (!v) return t;
  const swap: Record<string, string> = whoIsPlural
    ? { is: 'are', was: 'were', are: 'are', were: 'were' }
    : { are: 'is', were: 'was', is: 'is', was: 'was' };
  return swap[v] + t.slice(v.length);
}

function containsWord(sentence: string, word: string): boolean {
  const w = word.trim().toLowerCase();
  if (!w) return false;
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${esc}([^a-z]|$)`, 'i').test(sentence);
}

function challengeMet(sentence: string, c: Challenge | null | undefined): boolean {
  if (!c || !c.title) return false;
  if (c.required_word && !containsWord(sentence, c.required_word)) return false;
  if (c.min_words && countWords(sentence) < c.min_words) return false;
  // A challenge with no measurable rule (e.g. "Describe something at school") counts when the sentence is complete.
  return true;
}

interface QualityCheck {
  id: string;
  label: string;
  ok: boolean;
  hint?: string;
}

/** The friendly "Sentence Quality Checker". */
function checkQuality(p: Partial<SentenceParts>, whoIsPlural: boolean): QualityCheck[] {
  const s = buildSentence(p);
  const checks: QualityCheck[] = [
    { id: 'who', label: 'Who?', ok: !!p.who, hint: 'Pick WHO is in your sentence.' },
    { id: 'what', label: 'What happens?', ok: !!p.what, hint: 'Pick WHAT is happening.' },
    { id: 'where', label: 'Where?', ok: !!p.where, hint: 'Pick WHERE it happens.' },
    { id: 'when', label: 'When?', ok: !!p.when, hint: 'Pick WHEN it happens.' },
    { id: 'capital', label: 'Capital letter', ok: !!s && /^[A-Z]/.test(s), hint: 'Sentences start with a capital letter.' },
    { id: 'stop', label: 'Full stop', ok: !!s && s.endsWith('.'), hint: 'Sentences end with a full stop.' },
  ];
  if (p.who && p.what) {
    const agree = agreementOk(p.what, whoIsPlural);
    if (agree !== null) {
      checks.push({
        id: 'agree',
        label: whoIsPlural ? '"are" for many' : '"is" for one',
        ok: agree,
        hint: whoIsPlural
          ? `"${clean(p.who)}" means more than one, so we use "are".`
          : `"${clean(p.who)}" is just one, so we use "is".`,
      });
    }
  }
  return checks;
}

function cleanName(s: string): string {
  return s.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

// ---------- function ----------
// Student endpoint: public config, access-code check and submission upload.
// Students never get read access to anyone's submissions.

const MAX_PHOTO = 3 * 1024 * 1024;
const MAX_AUDIO = 6 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadConfig() {
  const db = admin();
  const settings = must(
    await db.from('app_settings').select('classroom_name, photo_required, word_of_day, challenge').eq('id', 1).single(),
  ) as { classroom_name: string; photo_required: boolean; word_of_day: WordOfDay | null; challenge: Challenge | null };
  const classes = must(await db.from('classes').select('name').order('name')) as { name: string }[];
  const words = must(
    await db.from('word_bank').select('id, category, text, is_plural, sort_order').order('sort_order').order('text'),
  ) as WordItem[];
  return { settings, classes, words };
}

async function checkCode(className: string, code: string) {
  const db = admin();
  const rows = must(await db.from('classes').select('id, name, access_code').ilike('name', className)) as {
    id: string;
    name: string;
    access_code: string;
  }[];
  const cls = rows.find((r) => r.name.toLowerCase() === className.toLowerCase());
  if (!cls || !safeEqual(cls.access_code.toUpperCase(), code.trim().toUpperCase())) {
    throw new HttpError(401, 'That classroom code is not right. Ask your teacher for help.');
  }
  return cls;
}

function extFor(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  return 'audio';
}

serve(async (req) => {
  const type = req.headers.get('content-type') ?? '';

  // ---------- Submission (multipart form) ----------
  if (type.includes('multipart/form-data')) {
    const form = await req.formData();
    const id = str(form.get('id'), 36);
    const pupil = cleanName(str(form.get('pupil_name'), 40));
    const className = str(form.get('class_name'), 40);
    const code = str(form.get('access_code'), 20);
    const who = str(form.get('who'), 60);
    let what = str(form.get('what'), 60);
    const where = str(form.get('where'), 60);
    const when = str(form.get('when'), 60);
    const duration = Math.max(0, Math.min(600000, Number(form.get('audio_duration_ms')) || 0));
    const photo = form.get('photo');
    const audio = form.get('audio');

    if (!UUID_RE.test(id)) throw new HttpError(400, 'Invalid submission id.');
    if (!pupil) throw new HttpError(400, 'Please type your name.');
    const cls = await checkCode(className, code);

    const db = admin();
    // Idempotency: a double tap or a retry after a dropped connection must not create a duplicate.
    const existing = must(await db.from('submissions').select('id').eq('id', id).maybeSingle());
    if (existing) return json(req, { ok: true, id, duplicate: true });

    const { settings, words } = await loadConfig();
    const pick = (cat: string, text: string) =>
      words.find((w) => w.category === cat && w.text.toLowerCase() === text.toLowerCase());
    const whoItem = pick('who', who);
    if (!whoItem) throw new HttpError(400, 'Please choose WHO from the word cards.');
    // WHAT must be a word-bank phrase, or that phrase with is/are fixed by the Quality Checker.
    const exact = pick('what', what);
    const fixed = exact
      ? null
      : words.find((w) => w.category === 'what' && fixAgreement(w.text, whoItem.is_plural).toLowerCase() === what.toLowerCase());
    if (!exact && !fixed) throw new HttpError(400, 'Please choose WHAT HAPPENS from the word cards.');
    what = exact ? exact.text : fixAgreement(fixed!.text, whoItem.is_plural);
    const whereItem = pick('where', where);
    const whenItem = pick('when', when);
    if (!whereItem) throw new HttpError(400, 'Please choose WHERE from the word cards.');
    if (!whenItem) throw new HttpError(400, 'Please choose WHEN from the word cards.');

    if (!(audio instanceof File) || audio.size === 0) throw new HttpError(400, 'Please record your voice first.');
    if (audio.size > MAX_AUDIO) throw new HttpError(413, 'The recording is too long. Please record again.');
    const audioMime = (audio.type || 'audio/webm').split(';')[0];
    if (!audioMime.startsWith('audio/')) throw new HttpError(400, 'That file is not a sound recording.');

    let photoPath: string | null = null;
    if (photo instanceof File && photo.size > 0) {
      if (photo.size > MAX_PHOTO) throw new HttpError(413, 'The photo is too big. Please take it again.');
      if (!/^image\/(jpeg|png|webp)$/.test(photo.type)) throw new HttpError(400, 'That file is not a photo.');
      photoPath = `photos/${id}.${photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg'}`;
    } else if (settings.photo_required) {
      throw new HttpError(400, 'Please take your photo first.');
    }

    const audioPath = `audio/${id}.${extFor(audioMime)}`;
    const store = db.storage.from(BUCKET);
    if (photoPath) {
      const up = await store.upload(photoPath, photo as File, { contentType: (photo as File).type, upsert: true });
      if (up.error) throw new HttpError(500, 'Could not save the photo. Please try again.');
    }
    const upA = await store.upload(audioPath, audio, { contentType: audioMime, upsert: true });
    if (upA.error) throw new HttpError(500, 'Could not save the recording. Please try again.');

    const sentence = buildSentence({ who: whoItem.text, what, where: whereItem.text, when: whenItem.text });
    const ins = await db.from('submissions').insert({
      id,
      pupil_name: pupil,
      class_name: cls.name,
      class_id: cls.id,
      sentence,
      who: whoItem.text,
      what_happens: what,
      where_text: whereItem.text,
      when_text: whenItem.text,
      photo_path: photoPath,
      audio_path: audioPath,
      audio_mime: audioMime,
      audio_duration_ms: duration,
      challenge_done: challengeMet(sentence, settings.challenge),
      used_word_of_day: !!settings.word_of_day?.word && containsWord(sentence, settings.word_of_day.word),
    });
    if (ins.error && ins.error.code !== '23505') {
      console.error(ins.error);
      throw new HttpError(500, 'Could not save your sentence. Please try again.');
    }
    return json(req, { ok: true, id });
  }

  // ---------- JSON actions ----------
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const action = str(body.action, 20) || 'config';

  if (action === 'config') {
    const { settings, classes, words } = await loadConfig();
    return json(req, {
      classroom_name: settings.classroom_name,
      photo_required: settings.photo_required,
      word_of_day: settings.word_of_day,
      challenge: settings.challenge,
      classes: classes.map((c) => c.name),
      words,
    });
  }

  if (action === 'verify') {
    const cls = await checkCode(str(body.class_name, 40), str(body.access_code, 20));
    return json(req, { ok: true, class_name: cls.name });
  }

  throw new HttpError(400, 'Unknown action.');
});
