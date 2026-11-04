// DEMO MODE — a pretend backend that runs entirely in this browser (IndexedDB).
// Mirrors the multi-teacher Edge Functions so the app can be tried and tested without Supabase.
// Seeded with: Teacher Rina (PIN 1234, admin) → class "3 Bestari" code FACTORY1. School code for new teachers: SCHOOL1
import {
  ApiError,
  type AdminTeacherRow,
  type Api,
  type ClassRow,
  type ProfileInput,
  type Status,
  type Submission,
  type TeacherProfile,
  type TeacherSettings,
} from './types';
import { clearToken, getToken, setToken } from './session';
import {
  buildSentence,
  challengeMet,
  cleanName,
  containsWord,
  fixAgreement,
  type Challenge,
  type WordItem,
  type WordOfDay,
} from '../lib/sentence';

interface DTeacher {
  id: string;
  title: string;
  name: string;
  school: string | null;
  subject: string | null;
  welcome_message: string | null;
  photo: Blob | null;
  pin: string;
  is_admin: boolean;
  photo_required: boolean;
  word_of_day: WordOfDay | null;
  challenge: Challenge | null;
  created_at: string;
}
interface DClass extends ClassRow {
  teacher_id: string;
}
interface DWord extends WordItem {
  teacher_id: string | null;
}
interface StoredSub extends Omit<Submission, 'photo_url' | 'audio_url' | 'has_photo'> {
  teacher_id: string;
  photo: Blob | null;
  audio: Blob;
}
interface School {
  school_name: string;
  registration_code: string;
}

const DB = 'sf360-demo-v2';
const STORE = 'data';

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(req.result as T);
    tx.onerror = () => rej(tx.error);
  });
}
const get = <T>(k: string) => idb<T | undefined>('readonly', (s) => s.get(k));
const put = (k: string, v: unknown) => idb('readwrite', (s) => s.put(v, k));
const del = (k: string) => idb('readwrite', (s) => s.delete(k));
const keys = () => idb<IDBValidKey[]>('readonly', (s) => s.getAllKeys());

const uid = () => crypto.randomUUID();
const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));
const display = (t: { title: string; name: string }) => `${t.title} ${t.name}`.trim();

const SEED: [WordItem['category'], string, boolean][] = [
  ['who', 'Aina', false], ['who', 'The boy', false], ['who', 'My friends', true],
  ['who', 'The teacher', false], ['who', 'The children', true], ['who', 'My mother', false],
  ['what', 'is reading a book', false], ['what', 'is playing football', false], ['what', 'are planting flowers', false],
  ['what', 'is drawing a picture', false], ['what', 'is watering the plants', false], ['what', 'are singing a song', false],
  ['where', 'in the library', false], ['where', 'on the field', false], ['where', 'in the classroom', false],
  ['where', 'near the garden', false], ['where', 'at the canteen', false], ['where', 'in the playground', false],
  ['when', 'after school', false], ['when', 'in the morning', false], ['when', 'on Sunday', false],
  ['when', 'every day', false], ['when', 'during recess', false], ['when', 'at the weekend', false],
];
const defaultWords = (teacher_id: string): DWord[] => {
  const n: Record<string, number> = {};
  return SEED.map(([category, text, is_plural]) => ({ id: uid(), teacher_id, category, text, is_plural, sort_order: (n[category] = (n[category] ?? 0) + 1) }));
};

let seeding: Promise<void> | null = null;
function ensureSeed() {
  seeding ??= (async () => {
    if (await get('school')) return;
    const rina: DTeacher = {
      id: uid(),
      title: 'Teacher',
      name: 'Rina',
      school: 'Demo Primary School',
      subject: 'English',
      welcome_message: 'Hello 3 Bestari! Let’s build great sentences!',
      photo: null,
      pin: '1234',
      is_admin: true,
      photo_required: true,
      word_of_day: null,
      challenge: null,
      created_at: new Date().toISOString(),
    };
    await put('teachers', [rina]);
    await put('classes', [{ id: uid(), teacher_id: rina.id, name: '3 Bestari', access_code: 'FACTORY1' }] satisfies DClass[]);
    await put('words', defaultWords(rina.id));
    await put('school', { school_name: 'Our Sentence Factory', registration_code: 'SCHOOL1' } satisfies School);
  })();
  return seeding;
}

const school = async () => (await ensureSeed(), (await get<School>('school'))!);
const teachers = async () => (await ensureSeed(), (await get<DTeacher[]>('teachers')) ?? []);
const classes = async () => (await ensureSeed(), (await get<DClass[]>('classes')) ?? []);
const words = async () => (await ensureSeed(), ((await get<DWord[]>('words')) ?? []).sort((a, b) => a.sort_order - b.sort_order));
const saveTeacher = async (t: DTeacher) => put('teachers', (await teachers()).map((x) => (x.id === t.id ? t : x)));

async function allSubs(): Promise<StoredSub[]> {
  const ks = (await keys()).filter((k) => String(k).startsWith('sub:'));
  const rows = await Promise.all(ks.map((k) => get<StoredSub>(String(k))));
  return rows.filter((r): r is StoredSub => !!r).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

const urlCache = new Map<string, { blob: Blob; url: string }>();
function blobUrl(key: string, b: Blob | null): string | null {
  if (!b) return null;
  const c = urlCache.get(key);
  if (c && c.blob === b) return c.url;
  if (c) URL.revokeObjectURL(c.url);
  const url = URL.createObjectURL(b);
  urlCache.set(key, { blob: b, url });
  return url;
}
function present(s: StoredSub, withMedia = true): Submission {
  const { photo, audio, teacher_id: _t, ...rest } = s;
  void _t;
  return { ...rest, has_photo: !!photo, photo_url: withMedia ? blobUrl('p' + s.id, photo) : null, audio_url: withMedia ? blobUrl('a' + s.id, audio) : null };
}
function profileOf(t: DTeacher): TeacherProfile {
  return {
    id: t.id,
    title: t.title,
    name: t.name,
    display_name: display(t),
    school: t.school,
    subject: t.subject,
    welcome_message: t.welcome_message,
    photo_url: blobUrl('t' + t.id, t.photo),
    is_admin: t.is_admin,
    using_initial_pin: false,
  };
}

// token format in demo: demo.<teacherId>.<pin>
function issue(t: DTeacher) {
  const expires_at = Date.now() + 8 * 3600_000;
  const token = `demo.${t.id}.${t.pin}`;
  setToken(token, expires_at);
  return { token, expires_at, teacher: profileOf(t) };
}
async function me(): Promise<DTeacher> {
  await delay(100);
  const [, id, pin] = (getToken() ?? '').split('.');
  const t = (await teachers()).find((x) => x.id === id);
  if (!t || t.pin !== pin) {
    clearToken();
    throw new ApiError('Your teacher session has ended. Please enter your PIN again.', 401);
  }
  return t;
}
async function needAdmin() {
  const t = await me();
  if (!t.is_admin) throw new ApiError('Only the school admin can do that.', 403);
  return t;
}

async function checkCode(classId: string, code: string) {
  const c = (await classes()).find((x) => x.id === classId);
  if (!c || c.access_code.toUpperCase() !== code.trim().toUpperCase()) {
    throw new ApiError('That classroom code is not right. Ask your teacher for help.', 401);
  }
  const t = (await teachers()).find((x) => x.id === c.teacher_id)!;
  return { c, t };
}

function cleanProfile(p: ProfileInput) {
  const name = (p.name ?? '').trim().slice(0, 40);
  if (!name) throw new ApiError('Please type your name.', 400);
  return {
    title: (p.title ?? '').trim().slice(0, 20) || 'Teacher',
    name,
    school: p.school?.trim() || null,
    subject: p.subject?.trim() || null,
    welcome_message: p.welcome_message?.trim().slice(0, 140) || null,
  };
}

const randomToken = () => {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function dataUrlToBlob(d: string): Promise<Blob> {
  return (await fetch(d)).blob();
}

export const demoApi: Api = {
  mode: 'demo',
  student: {
    async home() {
      await delay();
      const ts = await teachers();
      return {
        school_name: (await school()).school_name,
        classes: (await classes())
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => {
            const t = ts.find((x) => x.id === c.teacher_id)!;
            return { id: c.id, name: c.name, teacher_name: display(t), teacher_photo_url: blobUrl('t' + t.id, t.photo) };
          }),
      };
    },
    async verify(class_id, access_code) {
      await delay();
      const { c, t } = await checkCode(class_id, access_code);
      return {
        class_id: c.id,
        class_name: c.name,
        teacher: { ...profileOf(t), is_admin: undefined },
        photo_required: t.photo_required,
        word_of_day: t.word_of_day,
        challenge: t.challenge,
        words: (await words()).filter((w) => w.teacher_id === t.id),
      };
    },
    async submit(p, onProgress) {
      for (let i = 1; i <= 5; i++) {
        await delay(120);
        onProgress?.(i * 20);
      }
      if (!navigator.onLine) throw new ApiError('No internet connection. Please check the Wi-Fi and try again.', 0, true);
      const { c, t } = await checkCode(p.class_id, p.access_code);
      if (await get(`sub:${p.id}`)) return { ok: true, id: p.id };
      const ws = (await words()).filter((w) => w.teacher_id === t.id);
      const who = ws.find((w) => w.category === 'who' && w.text === p.who);
      if (!who) throw new ApiError('Please choose WHO from the word cards.', 400);
      if (!ws.some((w) => w.category === 'what' && (w.text === p.what || fixAgreement(w.text, who.is_plural) === p.what)))
        throw new ApiError('Please choose WHAT HAPPENS from the word cards.', 400);
      if (!p.audio?.size) throw new ApiError('Please record your voice first.', 400);
      if (!p.photo && t.photo_required) throw new ApiError('Please take your photo first.', 400);
      const sentence = buildSentence(p);
      await put(`sub:${p.id}`, {
        id: p.id,
        teacher_id: t.id,
        pupil_name: cleanName(p.pupil_name),
        class_name: c.name,
        sentence,
        who: p.who,
        what_happens: p.what,
        where_text: p.where,
        when_text: p.when,
        status: 'pending',
        created_at: new Date().toISOString(),
        reviewed_at: null,
        audio_duration_ms: Math.round(p.audio_duration_ms),
        challenge_done: challengeMet(sentence, t.challenge),
        used_word_of_day: !!t.word_of_day?.word && containsWord(sentence, t.word_of_day.word),
        share_token: null,
        audio_mime: p.audio.type || 'audio/webm',
        photo: p.photo,
        audio: p.audio,
      } satisfies StoredSub);
      return { ok: true, id: p.id };
    },
  },
  teacher: {
    async teachers() {
      await delay();
      return (await teachers())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => ({ id: t.id, display_name: display(t), photo_url: blobUrl('t' + t.id, t.photo), subject: t.subject }));
    },
    async register(p) {
      await delay(300);
      const s = await school();
      if ((p.school_code ?? '').trim().toUpperCase() !== s.registration_code.toUpperCase())
        throw new ApiError('That school code is not right. Ask your school admin.', 401);
      if (!/^\d{4,8}$/.test(p.pin)) throw new ApiError('Your PIN must be 4 to 8 digits.', 400);
      const prof = cleanProfile(p);
      const ts = await teachers();
      if (ts.some((t) => display(t).toLowerCase() === display(prof).toLowerCase()))
        throw new ApiError(`“${display(prof)}” is already registered. Add your surname or initial.`, 409);
      const t: DTeacher = {
        id: uid(),
        ...prof,
        photo: null,
        pin: p.pin,
        is_admin: ts.length === 0,
        photo_required: true,
        word_of_day: null,
        challenge: null,
        created_at: new Date().toISOString(),
      };
      await put('teachers', [...ts, t]);
      await put('words', [...(await words()), ...defaultWords(t.id)]);
      return { ...issue(t), first: ts.length === 0 };
    },
    async login(teacher_id, pin) {
      await delay(250);
      const t = (await teachers()).find((x) => x.id === teacher_id);
      if (!t || t.pin !== pin) throw new ApiError('Wrong PIN. Please try again.', 401);
      return issue(t);
    },
    async session() {
      return { ok: true, teacher: profileOf(await me()) };
    },
    async stats() {
      const t = await me();
      const all = (await allSubs()).filter((x) => x.teacher_id === t.id);
      const n = (st: Status) => all.filter((x) => x.status === st).length;
      return { total: all.length, pending: n('pending'), approved: n('approved'), rejected: n('rejected') };
    },
    async list(f) {
      const t = await me();
      return (await allSubs())
        .filter((x) => x.teacher_id === t.id && (!f.status || x.status === f.status) && (!f.class_name || x.class_name === f.class_name))
        .map((x) => present(x, false));
    },
    async get(id) {
      const t = await me();
      const r = await get<StoredSub>(`sub:${id}`);
      if (!r || r.teacher_id !== t.id) throw new ApiError('Submission not found.', 404);
      return present(r);
    },
    async setStatus(id, status) {
      const t = await me();
      const r = await get<StoredSub>(`sub:${id}`);
      if (!r || r.teacher_id !== t.id) throw new ApiError('Submission not found.', 404);
      r.status = status;
      r.reviewed_at = new Date().toISOString();
      if (status === 'approved' && !r.share_token) r.share_token = randomToken();
      await put(`sub:${id}`, r);
    },
    async remove(id) {
      const t = await me();
      const r = await get<StoredSub>(`sub:${id}`);
      if (r && r.teacher_id === t.id) await del(`sub:${id}`);
    },
    async gallery(class_name) {
      const t = await me();
      return (await allSubs())
        .filter((x) => x.teacher_id === t.id && x.status === 'approved' && (!class_name || x.class_name === class_name))
        .sort((a, b) => a.class_name.localeCompare(b.class_name) || a.pupil_name.localeCompare(b.pupil_name))
        .map((x) => present(x));
    },
    async cards(f) {
      const g = await demoApi.teacher.gallery(f.class_name);
      return f.ids?.length ? g.filter((x) => f.ids!.includes(x.id)) : g;
    },
    async getSettings(): Promise<TeacherSettings> {
      const t = await me();
      const s = await school();
      const ts = await teachers();
      const cs = await classes();
      const out: TeacherSettings = {
        school_name: s.school_name,
        profile: profileOf(t),
        photo_required: t.photo_required,
        word_of_day: t.word_of_day,
        challenge: t.challenge,
        classes: cs.filter((c) => c.teacher_id === t.id).sort((a, b) => a.name.localeCompare(b.name)).map(({ id, name, access_code }) => ({ id, name, access_code })),
        words: (await words()).filter((w) => w.teacher_id === t.id),
      };
      if (t.is_admin)
        out.admin = {
          registration_code: s.registration_code,
          teachers: ts
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(
              (x): AdminTeacherRow => ({
                id: x.id,
                display_name: display(x),
                school: x.school,
                subject: x.subject,
                is_admin: x.is_admin,
                class_count: cs.filter((c) => c.teacher_id === x.id).length,
                created_at: x.created_at,
              }),
            ),
        };
      return out;
    },
    async updateSettings(p) {
      const t = await me();
      await saveTeacher({ ...t, ...p });
    },
    async updateProfile(p) {
      const t = await me();
      const prof = cleanProfile(p);
      if ((await teachers()).some((x) => x.id !== t.id && display(x).toLowerCase() === display(prof).toLowerCase()))
        throw new ApiError(`“${display(prof)}” is already registered.`, 409);
      await saveTeacher({ ...t, ...prof });
    },
    async setPhoto(dataUrl) {
      const t = await me();
      await saveTeacher({ ...t, photo: await dataUrlToBlob(dataUrl) });
    },
    async removePhoto() {
      const t = await me();
      await saveTeacher({ ...t, photo: null });
    },
    async classAdd(name, access_code) {
      const t = await me();
      const cs = await classes();
      if (cs.some((c) => c.teacher_id === t.id && c.name.toLowerCase() === name.trim().toLowerCase()))
        throw new ApiError('You already have a class with that name.', 409);
      if (access_code.trim().length < 4) throw new ApiError('The access code needs at least 4 letters or numbers.', 400);
      await put('classes', [...cs, { id: uid(), teacher_id: t.id, name: name.trim(), access_code: access_code.trim().toUpperCase() }]);
    },
    async classUpdate(id, name, access_code) {
      const t = await me();
      if (access_code.trim().length < 4) throw new ApiError('The access code needs at least 4 letters or numbers.', 400);
      await put(
        'classes',
        (await classes()).map((c) => (c.id === id && c.teacher_id === t.id ? { ...c, name: name.trim(), access_code: access_code.trim().toUpperCase() } : c)),
      );
    },
    async classDelete(id) {
      const t = await me();
      await put('classes', (await classes()).filter((c) => !(c.id === id && c.teacher_id === t.id)));
    },
    async wordAdd(category, text, is_plural) {
      const t = await me();
      const ws = await words();
      const txt = text.trim().replace(/[.!?]+$/, '');
      if (!txt) throw new ApiError('Please type a word or phrase.', 400);
      const mine = ws.filter((w) => w.teacher_id === t.id);
      if (mine.some((w) => w.category === category && w.text.toLowerCase() === txt.toLowerCase()))
        throw new ApiError('That word is already in your word bank.', 409);
      const max = Math.max(0, ...mine.filter((w) => w.category === category).map((w) => w.sort_order));
      await put('words', [...ws, { id: uid(), teacher_id: t.id, category, text: txt, is_plural: category === 'who' && is_plural, sort_order: max + 1 }]);
    },
    async wordDelete(id) {
      const t = await me();
      await put('words', (await words()).filter((w) => !(w.id === id && w.teacher_id === t.id)));
    },
    async changePin(current_pin, new_pin) {
      const t = await me();
      if (current_pin !== t.pin) throw new ApiError('Your current PIN is not right.', 401);
      if (!/^\d{4,8}$/.test(new_pin)) throw new ApiError('The new PIN must be 4 to 8 digits.', 400);
      const nt = { ...t, pin: new_pin };
      await saveTeacher(nt);
      issue(nt);
    },
    async schoolUpdate(p) {
      await needAdmin();
      const s = await school();
      const code = p.registration_code === undefined ? s.registration_code : (p.registration_code ?? '').trim().toUpperCase();
      if (code && code.length < 6) throw new ApiError('The school code needs at least 6 letters or numbers.', 400);
      await put('school', { school_name: p.school_name?.trim() || s.school_name, registration_code: code || 'SCHOOL1' });
    },
    async resetTeacherPin(teacher_id, new_pin) {
      await needAdmin();
      if (!/^\d{4,8}$/.test(new_pin)) throw new ApiError('The new PIN must be 4 to 8 digits.', 400);
      const t = (await teachers()).find((x) => x.id === teacher_id);
      if (t) await saveTeacher({ ...t, pin: new_pin });
    },
    async setAdmin(teacher_id, is_admin) {
      await needAdmin();
      const ts = await teachers();
      if (!is_admin && ts.filter((x) => x.is_admin).length <= 1) throw new ApiError('The school needs at least one admin.', 400);
      const t = ts.find((x) => x.id === teacher_id);
      if (t) await saveTeacher({ ...t, is_admin });
    },
    async removeTeacher(teacher_id) {
      const a = await needAdmin();
      if (teacher_id === a.id) throw new ApiError('You cannot remove yourself.', 400);
      for (const s of await allSubs()) if (s.teacher_id === teacher_id) await del(`sub:${s.id}`);
      await put('classes', (await classes()).filter((c) => c.teacher_id !== teacher_id));
      await put('words', (await words()).filter((w) => w.teacher_id !== teacher_id));
      await put('teachers', (await teachers()).filter((t) => t.id !== teacher_id));
    },
  },
  async listen(token) {
    await delay();
    const r = (await allSubs()).find((x) => x.share_token === token && x.status === 'approved');
    if (!r) throw new ApiError('This recording could not be found.', 404);
    const t = (await teachers()).find((x) => x.id === r.teacher_id);
    return {
      pupil_name: r.pupil_name,
      class_name: r.class_name,
      sentence: r.sentence,
      audio_url: blobUrl('a' + r.id, r.audio)!,
      audio_mime: r.audio_mime,
      classroom_name: t?.school || (await school()).school_name,
      teacher_name: t ? display(t) : null,
      teacher_photo_url: t ? blobUrl('t' + t.id, t.photo) : null,
    };
  },
};
