import { ApiError, type Api, type LoginResult, type LoginTeacher, type Submission } from './types';
import { clearToken, getToken, setToken } from './session';

const URL_BASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
const ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export const supabaseConfigured = !!URL_BASE && !!ANON && !URL_BASE.includes('YOUR-PROJECT');

const OFFLINE_MSG = 'No internet connection. Please check the Wi-Fi and try again.';

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: ANON, Authorization: `Bearer ${ANON}`, ...extra };
}

async function call<T>(fn: string, body: unknown, teacher = false): Promise<T> {
  if (!supabaseConfigured) throw new ApiError('The app is not connected to Supabase yet. See README → Configure.', 0);
  const h = headers({ 'Content-Type': 'application/json' });
  if (teacher) {
    const t = getToken();
    if (!t) {
      clearToken();
      throw new ApiError('Please enter your PIN again.', 401);
    }
    h['x-teacher-token'] = t;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(`${URL_BASE}/functions/v1/${fn}`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError(navigator.onLine ? 'The server is taking too long. Please try again.' : OFFLINE_MSG, 0, true);
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    if (teacher && res.status === 401) clearToken();
    throw new ApiError(data.error || `Server error (${res.status}).`, res.status);
  }
  return data;
}

const t = <T>(action: string, extra: Record<string, unknown> = {}) => call<T>('teacher', { action, ...extra }, true);

export const supabaseApi: Api = {
  mode: 'supabase',
  student: {
    home: () => call('student', { action: 'classes' }),
    verify: (class_id, access_code) => call('student', { action: 'verify', class_id, access_code }),
    submit: (p, onProgress) =>
      new Promise((resolve, reject) => {
        if (!supabaseConfigured) return reject(new ApiError('The app is not connected to Supabase yet.', 0));
        const fd = new FormData();
        fd.set('id', p.id);
        fd.set('pupil_name', p.pupil_name);
        fd.set('class_id', p.class_id);
        fd.set('access_code', p.access_code);
        fd.set('who', p.who);
        fd.set('what', p.what);
        fd.set('where', p.where);
        fd.set('when', p.when);
        fd.set('audio_duration_ms', String(Math.round(p.audio_duration_ms)));
        if (p.photo) fd.set('photo', p.photo, 'photo.jpg');
        const ext = p.audio.type.includes('mp4') ? 'm4a' : p.audio.type.includes('ogg') ? 'ogg' : 'webm';
        fd.set('audio', p.audio, `voice.${ext}`);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${URL_BASE}/functions/v1/student`);
        Object.entries(headers()).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.timeout = 90_000;
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => {
          let data: { error?: string; ok?: boolean; id?: string } = {};
          try {
            data = JSON.parse(xhr.responseText);
          } catch {
            /* ignore */
          }
          if (xhr.status >= 200 && xhr.status < 300) resolve({ ok: true, id: data.id ?? p.id });
          else reject(new ApiError(data.error || `Server error (${xhr.status}).`, xhr.status));
        };
        xhr.onerror = () => reject(new ApiError(navigator.onLine ? 'Could not reach the server. Please try again.' : OFFLINE_MSG, 0, true));
        xhr.ontimeout = () => reject(new ApiError('Sending took too long. Please try again.', 0, true));
        xhr.send(fd);
      }),
  },
  teacher: {
    teachers: async () => (await call<{ teachers: LoginTeacher[] }>('teacher', { action: 'teachers' })).teachers,
    register: async (p) => {
      const r = await call<LoginResult>('teacher', { action: 'register', ...p });
      setToken(r.token, r.expires_at);
      return r;
    },
    login: async (teacher_id, pin) => {
      const r = await call<LoginResult>('teacher', { action: 'login', teacher_id, pin });
      setToken(r.token, r.expires_at);
      return r;
    },
    session: () => t('session'),
    stats: () => t('stats'),
    list: async (f) => (await t<{ submissions: Submission[] }>('list', f)).submissions,
    get: async (id) => (await t<{ submission: Submission }>('get', { id })).submission,
    setStatus: async (id, status) => void (await t('set_status', { id, status })),
    remove: async (id) => void (await t('delete', { id })),
    gallery: async (class_name) => (await t<{ submissions: Submission[] }>('gallery', { class_name })).submissions,
    cards: async (f) => (await t<{ submissions: Submission[] }>('cards', f)).submissions,
    getSettings: () => t('get_settings'),
    updateSettings: async (p) => void (await t('update_settings', p)),
    updateProfile: async (p) => void (await t('update_profile', { ...p })),
    setPhoto: async (data_url) => void (await t('set_photo', { data_url })),
    removePhoto: async () => void (await t('remove_photo')),
    classAdd: async (name, access_code) => void (await t('class_add', { name, access_code })),
    classUpdate: async (id, name, access_code) => void (await t('class_update', { id, name, access_code })),
    classDelete: async (id) => void (await t('class_delete', { id })),
    wordAdd: async (category, text, is_plural) => void (await t('word_add', { category, text, is_plural })),
    wordDelete: async (id) => void (await t('word_delete', { id })),
    changePin: async (current_pin, new_pin) => {
      const r = await t<{ token: string; expires_at: number }>('change_pin', { current_pin, new_pin });
      setToken(r.token, r.expires_at);
    },
    schoolUpdate: async (p) => void (await t('school_update', p)),
    resetTeacherPin: async (teacher_id, new_pin) => void (await t('teacher_reset_pin', { teacher_id, new_pin })),
    setAdmin: async (teacher_id, is_admin) => void (await t('teacher_set_admin', { teacher_id, is_admin })),
    removeTeacher: async (teacher_id) => void (await t('teacher_remove', { teacher_id })),
  },
  listen: (token) => call('listen', { token }),
};
