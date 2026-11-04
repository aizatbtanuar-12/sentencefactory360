// Student endpoint: class list, access-code check (returns that teacher's word bank)
// and submission upload. Students never get read access to anyone's submissions.
import {
  admin,
  BUCKET,
  displayName,
  HttpError,
  json,
  must,
  publicTeacher,
  safeEqual,
  serve,
  signUrls,
  str,
  UUID_RE,
  type TeacherRow,
} from '../_shared/util.ts';
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

interface ClassRow {
  id: string;
  name: string;
  access_code: string;
  teacher_id: string | null;
}

/** Check a class's access code; returns the class and its teacher. */
async function checkCode(classId: string, code: string) {
  if (!UUID_RE.test(classId)) throw new HttpError(400, 'Please choose your class.');
  const db = admin();
  const cls = must(await db.from('classes').select('id, name, access_code, teacher_id').eq('id', classId).maybeSingle()) as
    | ClassRow
    | null;
  if (!cls || !cls.teacher_id || !safeEqual(cls.access_code.toUpperCase(), code.trim().toUpperCase())) {
    throw new HttpError(401, 'That classroom code is not right. Ask your teacher for help.');
  }
  const teacher = must(await db.from('teachers').select('*').eq('id', cls.teacher_id).single()) as TeacherRow;
  return { cls, teacher };
}

async function teacherWords(teacherId: string): Promise<WordItem[]> {
  return must(
    await admin()
      .from('word_bank')
      .select('id, category, text, is_plural, sort_order')
      .eq('teacher_id', teacherId)
      .order('sort_order')
      .order('text'),
  ) as WordItem[];
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
    const classId = str(form.get('class_id'), 36);
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
    const { cls, teacher } = await checkCode(classId, code);

    const db = admin();
    // Idempotency: a double tap or a retry after a dropped connection must not create a duplicate.
    const existing = must(await db.from('submissions').select('id').eq('id', id).maybeSingle());
    if (existing) return json(req, { ok: true, id, duplicate: true });

    const words = await teacherWords(teacher.id);
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
    } else if (teacher.photo_required) {
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

    const wod = teacher.word_of_day as WordOfDay | null;
    const sentence = buildSentence({ who: whoItem.text, what, where: whereItem.text, when: whenItem.text });
    const ins = await db.from('submissions').insert({
      id,
      pupil_name: pupil,
      class_name: cls.name,
      class_id: cls.id,
      teacher_id: teacher.id,
      sentence,
      who: whoItem.text,
      what_happens: what,
      where_text: whereItem.text,
      when_text: whenItem.text,
      photo_path: photoPath,
      audio_path: audioPath,
      audio_mime: audioMime,
      audio_duration_ms: duration,
      challenge_done: challengeMet(sentence, teacher.challenge as Challenge | null),
      used_word_of_day: !!wod?.word && containsWord(sentence, wod.word),
    });
    if (ins.error && ins.error.code !== '23505') {
      console.error(ins.error);
      throw new HttpError(500, 'Could not save your sentence. Please try again.');
    }
    return json(req, { ok: true, id, teacher_name: displayName(teacher) });
  }

  // ---------- JSON actions ----------
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const action = str(body.action, 20) || 'classes';
  const db = admin();

  if (action === 'classes' || action === 'config') {
    const settings = must(await db.from('app_settings').select('classroom_name').eq('id', 1).single()) as {
      classroom_name: string;
    };
    const classes = must(await db.from('classes').select('id, name, teacher_id').not('teacher_id', 'is', null).order('name')) as {
      id: string;
      name: string;
      teacher_id: string;
    }[];
    const teachers = must(
      await db.from('teachers').select('id, title, name, photo_path').in('id', [...new Set(classes.map((c) => c.teacher_id))]),
    ) as Pick<TeacherRow, 'id' | 'title' | 'name' | 'photo_path'>[];
    const urls = await signUrls(teachers.map((t) => t.photo_path));
    const byId = new Map(teachers.map((t) => [t.id, t]));
    return json(req, {
      school_name: settings.classroom_name,
      classes: classes.map((c) => {
        const t = byId.get(c.teacher_id);
        return {
          id: c.id,
          name: c.name,
          teacher_name: t ? displayName(t) : '',
          teacher_photo_url: t?.photo_path ? urls.get(t.photo_path) ?? null : null,
        };
      }),
    });
  }

  if (action === 'verify') {
    const { cls, teacher } = await checkCode(str(body.class_id, 36), str(body.access_code, 20));
    const urls = await signUrls([teacher.photo_path]);
    const t = publicTeacher(teacher, urls);
    return json(req, {
      class_id: cls.id,
      class_name: cls.name,
      teacher: { ...t, is_admin: undefined },
      photo_required: teacher.photo_required,
      word_of_day: teacher.word_of_day,
      challenge: teacher.challenge,
      words: await teacherWords(teacher.id),
    });
  }

  throw new HttpError(400, 'Unknown action.');
});
