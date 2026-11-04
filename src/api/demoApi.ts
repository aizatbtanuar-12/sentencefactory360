// DEMO MODE — a pretend backend that runs entirely in this browser (IndexedDB).
// Used for trying the app and for testing without Supabase. Nothing leaves the device.
// Demo teacher PIN: 1234   Demo class: "3 Bestari", code FACTORY1
import { ApiError, type Api, type ClassRow, type Status, type Submission, type TeacherSettings } from './types';
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

interface StoredSub extends Omit<Submission, 'photo_url' | 'audio_url' | 'has_photo'> {
  photo: Blob | null;
  audio: Blob;
}
interface Settings {
  classroom_name: string;
  photo_required: boolean;
  word_of_day: WordOfDay | null;
  challenge: Challenge | null;
  pin: string;
  using_initial_pin: boolean;
}

const DB = 'sf360-demo';
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
const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

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

async function ensureSeed() {
  if (await get('settings')) return;
  const counters: Record<string, number> = {};
  const words: WordItem[] = SEED.map(([category, text, is_plural]) => ({
    id: uid(),
    category,
    text,
    is_plural,
    sort_order: (counters[category] = (counters[category] ?? 0) + 1),
  }));
  await put('words', words);
  await put('classes', [{ id: uid(), name: '3 Bestari', access_code: 'FACTORY1' }] satisfies ClassRow[]);
  await put('settings', {
    classroom_name: 'Our Sentence Factory',
    photo_required: true,
    word_of_day: null,
    challenge: null,
    pin: '1234',
    using_initial_pin: true,
  } satisfies Settings);
}

const settings = async () => (await ensureSeed(), (await get<Settings>('settings'))!);
const words = async () => (await ensureSeed(), ((await get<WordItem[]>('words')) ?? []).sort((a, b) => a.sort_order - b.sort_order));
const classes = async () => (await ensureSeed(), ((await get<ClassRow[]>('classes')) ?? []).sort((a, b) => a.name.localeCompare(b.name)));

async function allSubs(): Promise<StoredSub[]> {
  const ks = (await keys()).filter((k) => String(k).startsWith('sub:'));
  const rows = await Promise.all(ks.map((k) => get<StoredSub>(String(k))));
  return rows.filter((r): r is StoredSub => !!r).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

const urlCache = new Map<string, string>();
function blobUrl(key: string, b: Blob | null): string | null {
  if (!b) return null;
  if (!urlCache.has(key)) urlCache.set(key, URL.createObjectURL(b));
  return urlCache.get(key)!;
}
function present(s: StoredSub, withMedia = true): Submission {
  const { photo, audio, ...rest } = s;
  return {
    ...rest,
    has_photo: !!photo,
    photo_url: withMedia ? blobUrl('p' + s.id, photo) : null,
    audio_url: withMedia ? blobUrl('a' + s.id, audio) : null,
  };
}

async function needTeacher() {
  await delay(120);
  const tk = getToken();
  const s = await settings();
  if (!tk || tk !== `demo.${s.pin}`) {
    clearToken();
    throw new ApiError('Your teacher session has ended. Please enter your PIN again.', 401);
  }
}

async function checkCode(className: string, code: string) {
  const c = (await classes()).find((x) => x.name.toLowerCase() === className.toLowerCase());
  if (!c || c.access_code.toUpperCase() !== code.trim().toUpperCase()) {
    throw new ApiError('That classroom code is not right. Ask your teacher for help.', 401);
  }
  return c;
}

const randomToken = () => {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const demoApi: Api = {
  mode: 'demo',
  student: {
    async config() {
      await delay();
      const s = await settings();
      return {
        classroom_name: s.classroom_name,
        photo_required: s.photo_required,
        word_of_day: s.word_of_day,
        challenge: s.challenge,
        classes: (await classes()).map((c) => c.name),
        words: await words(),
      };
    },
    async verify(class_name, access_code) {
      await delay();
      const c = await checkCode(class_name, access_code);
      return { ok: true, class_name: c.name };
    },
    async submit(p, onProgress) {
      for (let i = 1; i <= 5; i++) {
        await delay(150);
        onProgress?.(i * 20);
      }
      if (!navigator.onLine) throw new ApiError('No internet connection. Please check the Wi-Fi and try again.', 0, true);
      const c = await checkCode(p.class_name, p.access_code);
      if (await get(`sub:${p.id}`)) return { ok: true, id: p.id };
      const ws = await words();
      const s = await settings();
      const who = ws.find((w) => w.category === 'who' && w.text === p.who);
      if (!who) throw new ApiError('Please choose WHO from the word cards.', 400);
      const okWhat = ws.some((w) => w.category === 'what' && (w.text === p.what || fixAgreement(w.text, who.is_plural) === p.what));
      if (!okWhat) throw new ApiError('Please choose WHAT HAPPENS from the word cards.', 400);
      if (!p.audio?.size) throw new ApiError('Please record your voice first.', 400);
      if (!p.photo && s.photo_required) throw new ApiError('Please take your photo first.', 400);
      const sentence = buildSentence(p);
      const row: StoredSub = {
        id: p.id,
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
        challenge_done: challengeMet(sentence, s.challenge),
        used_word_of_day: !!s.word_of_day?.word && containsWord(sentence, s.word_of_day.word),
        share_token: null,
        audio_mime: p.audio.type || 'audio/webm',
        photo: p.photo,
        audio: p.audio,
      };
      await put(`sub:${p.id}`, row);
      return { ok: true, id: p.id };
    },
  },
  teacher: {
    async login(pin) {
      await delay(300);
      const s = await settings();
      if (pin !== s.pin) throw new ApiError('Wrong PIN. Please try again.', 401);
      const expires_at = Date.now() + 8 * 3600_000;
      setToken(`demo.${s.pin}`, expires_at);
      return { token: `demo.${s.pin}`, expires_at, using_initial_pin: s.using_initial_pin };
    },
    async session() {
      await needTeacher();
      return { ok: true, using_initial_pin: (await settings()).using_initial_pin };
    },
    async stats() {
      await needTeacher();
      const all = await allSubs();
      const n = (st: Status) => all.filter((x) => x.status === st).length;
      return { total: all.length, pending: n('pending'), approved: n('approved'), rejected: n('rejected') };
    },
    async list(f) {
      await needTeacher();
      return (await allSubs())
        .filter((x) => (!f.status || x.status === f.status) && (!f.class_name || x.class_name === f.class_name))
        .map((x) => present(x, false));
    },
    async get(id) {
      await needTeacher();
      const r = await get<StoredSub>(`sub:${id}`);
      if (!r) throw new ApiError('Submission not found.', 404);
      return present(r);
    },
    async setStatus(id, status) {
      await needTeacher();
      const r = await get<StoredSub>(`sub:${id}`);
      if (!r) throw new ApiError('Submission not found.', 404);
      r.status = status;
      r.reviewed_at = new Date().toISOString();
      if (status === 'approved' && !r.share_token) r.share_token = randomToken();
      await put(`sub:${id}`, r);
    },
    async remove(id) {
      await needTeacher();
      await del(`sub:${id}`);
    },
    async gallery(class_name) {
      await needTeacher();
      return (await allSubs())
        .filter((x) => x.status === 'approved' && (!class_name || x.class_name === class_name))
        .sort((a, b) => a.class_name.localeCompare(b.class_name) || a.pupil_name.localeCompare(b.pupil_name))
        .map((x) => present(x));
    },
    async cards(f) {
      const g = await demoApi.teacher.gallery(f.class_name);
      return f.ids?.length ? g.filter((x) => f.ids!.includes(x.id)) : g;
    },
    async getSettings(): Promise<TeacherSettings> {
      await needTeacher();
      const s = await settings();
      return {
        classroom_name: s.classroom_name,
        photo_required: s.photo_required,
        word_of_day: s.word_of_day,
        challenge: s.challenge,
        using_initial_pin: s.using_initial_pin,
        classes: await classes(),
        words: await words(),
      };
    },
    async updateSettings(p) {
      await needTeacher();
      const s = await settings();
      await put('settings', { ...s, ...p });
    },
    async classAdd(name, access_code) {
      await needTeacher();
      const cs = await classes();
      if (cs.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) throw new ApiError('That class already exists.', 409);
      if (access_code.trim().length < 4) throw new ApiError('The access code needs at least 4 letters or numbers.', 400);
      await put('classes', [...cs, { id: uid(), name: name.trim(), access_code: access_code.trim().toUpperCase() }]);
    },
    async classUpdate(id, name, access_code) {
      await needTeacher();
      if (access_code.trim().length < 4) throw new ApiError('The access code needs at least 4 letters or numbers.', 400);
      await put('classes', (await classes()).map((c) => (c.id === id ? { ...c, name: name.trim(), access_code: access_code.trim().toUpperCase() } : c)));
    },
    async classDelete(id) {
      await needTeacher();
      await put('classes', (await classes()).filter((c) => c.id !== id));
    },
    async wordAdd(category, text, is_plural) {
      await needTeacher();
      const ws = await words();
      const t = text.trim().replace(/[.!?]+$/, '');
      if (!t) throw new ApiError('Please type a word or phrase.', 400);
      if (ws.some((w) => w.category === category && w.text.toLowerCase() === t.toLowerCase()))
        throw new ApiError('That word is already in the word bank.', 409);
      const max = Math.max(0, ...ws.filter((w) => w.category === category).map((w) => w.sort_order));
      await put('words', [...ws, { id: uid(), category, text: t, is_plural: category === 'who' && is_plural, sort_order: max + 1 }]);
    },
    async wordDelete(id) {
      await needTeacher();
      await put('words', (await words()).filter((w) => w.id !== id));
    },
    async changePin(current_pin, new_pin) {
      await needTeacher();
      const s = await settings();
      if (current_pin !== s.pin) throw new ApiError('Your current PIN is not right.', 401);
      if (!/^\d{4,8}$/.test(new_pin)) throw new ApiError('The new PIN must be 4 to 8 digits.', 400);
      await put('settings', { ...s, pin: new_pin, using_initial_pin: false });
      setToken(`demo.${new_pin}`, Date.now() + 8 * 3600_000);
    },
  },
  async listen(token) {
    await delay();
    const r = (await allSubs()).find((x) => x.share_token === token && x.status === 'approved');
    if (!r) throw new ApiError('This recording could not be found.', 404);
    const s = await settings();
    return {
      pupil_name: r.pupil_name,
      class_name: r.class_name,
      sentence: r.sentence,
      audio_url: blobUrl('a' + r.id, r.audio)!,
      audio_mime: r.audio_mime,
      classroom_name: s.classroom_name,
    };
  },
};
