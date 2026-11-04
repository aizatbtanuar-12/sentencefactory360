// Student endpoint: public config, access-code check and submission upload.
// Students never get read access to anyone's submissions.
import { admin, BUCKET, HttpError, json, must, safeEqual, serve, str } from '../_shared/util.ts';
import {
  buildSentence,
  challengeMet,
  cleanName,
  containsWord,
  fixAgreement,
  type Challenge,
  type WordItem,
  type WordOfDay,
} from '../_shared/sentence.ts';

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
