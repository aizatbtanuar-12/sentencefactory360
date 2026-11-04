import type { Category, Challenge, WordItem, WordOfDay } from '../lib/sentence';

export type Status = 'pending' | 'approved' | 'rejected';

export interface StudentConfig {
  classroom_name: string;
  photo_required: boolean;
  word_of_day: WordOfDay | null;
  challenge: Challenge | null;
  classes: string[];
  words: WordItem[];
}

export interface SubmitPayload {
  id: string;
  pupil_name: string;
  class_name: string;
  access_code: string;
  who: string;
  what: string;
  where: string;
  when: string;
  photo: Blob | null;
  audio: Blob;
  audio_duration_ms: number;
}

export interface Submission {
  id: string;
  pupil_name: string;
  class_name: string;
  sentence: string;
  who: string;
  what_happens: string;
  where_text: string;
  when_text: string;
  status: Status;
  created_at: string;
  reviewed_at: string | null;
  audio_duration_ms: number | null;
  challenge_done: boolean;
  used_word_of_day: boolean;
  share_token: string | null;
  audio_mime: string | null;
  has_photo: boolean;
  photo_url: string | null;
  audio_url: string | null;
}

export interface Stats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export interface ClassRow {
  id: string;
  name: string;
  access_code: string;
}

export interface TeacherSettings {
  classroom_name: string;
  photo_required: boolean;
  word_of_day: WordOfDay | null;
  challenge: Challenge | null;
  using_initial_pin: boolean;
  classes: ClassRow[];
  words: WordItem[];
}

export interface ListenData {
  pupil_name: string;
  class_name: string;
  sentence: string;
  audio_url: string;
  audio_mime: string | null;
  classroom_name: string;
}

export interface LoginResult {
  token: string;
  expires_at: number;
  using_initial_pin: boolean;
}

export interface Api {
  mode: 'supabase' | 'demo';
  student: {
    config(): Promise<StudentConfig>;
    verify(class_name: string, access_code: string): Promise<{ ok: true; class_name: string }>;
    submit(p: SubmitPayload, onProgress?: (pct: number) => void): Promise<{ ok: true; id: string }>;
  };
  teacher: {
    login(pin: string): Promise<LoginResult>;
    session(): Promise<{ ok: true; using_initial_pin: boolean }>;
    stats(): Promise<Stats>;
    list(f: { status?: Status | ''; class_name?: string }): Promise<Submission[]>;
    get(id: string): Promise<Submission>;
    setStatus(id: string, status: Status): Promise<void>;
    remove(id: string): Promise<void>;
    gallery(class_name?: string): Promise<Submission[]>;
    cards(f: { ids?: string[]; class_name?: string }): Promise<Submission[]>;
    getSettings(): Promise<TeacherSettings>;
    updateSettings(p: Partial<Pick<TeacherSettings, 'classroom_name' | 'photo_required' | 'word_of_day' | 'challenge'>>): Promise<void>;
    classAdd(name: string, access_code: string): Promise<void>;
    classUpdate(id: string, name: string, access_code: string): Promise<void>;
    classDelete(id: string): Promise<void>;
    wordAdd(category: Category, text: string, is_plural: boolean): Promise<void>;
    wordDelete(id: string): Promise<void>;
    changePin(current_pin: string, new_pin: string): Promise<void>;
  };
  listen(token: string): Promise<ListenData>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public offline = false,
  ) {
    super(message);
  }
}
