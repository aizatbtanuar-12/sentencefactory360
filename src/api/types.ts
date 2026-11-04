import type { Category, Challenge, WordItem, WordOfDay } from '../lib/sentence';

export type Status = 'pending' | 'approved' | 'rejected';

export interface TeacherPublic {
  id: string;
  title: string;
  name: string;
  display_name: string;
  school: string | null;
  subject: string | null;
  welcome_message: string | null;
  photo_url: string | null;
  is_admin?: boolean;
}

export interface TeacherProfile extends TeacherPublic {
  is_admin: boolean;
  using_initial_pin: boolean;
}

/** What the tablet shows before a pupil picks a class. */
export interface StudentHome {
  school_name: string;
  classes: { id: string; name: string; teacher_name: string; teacher_photo_url: string | null }[];
}

/** One class's set-up, returned once the pupil's class code is correct. */
export interface StudentConfig {
  class_id: string;
  class_name: string;
  teacher: TeacherPublic;
  photo_required: boolean;
  word_of_day: WordOfDay | null;
  challenge: Challenge | null;
  words: WordItem[];
}

export interface SubmitPayload {
  id: string;
  pupil_name: string;
  class_id: string;
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

export interface AdminTeacherRow {
  id: string;
  display_name: string;
  school: string | null;
  subject: string | null;
  is_admin: boolean;
  class_count: number;
  created_at: string;
}

export interface TeacherSettings {
  school_name: string;
  profile: TeacherProfile;
  photo_required: boolean;
  word_of_day: WordOfDay | null;
  challenge: Challenge | null;
  classes: ClassRow[];
  words: WordItem[];
  admin?: { registration_code: string | null; teachers: AdminTeacherRow[] };
}

export interface LoginTeacher {
  id: string;
  display_name: string;
  photo_url: string | null;
  subject: string | null;
}

export interface ProfileInput {
  title: string;
  name: string;
  school?: string | null;
  subject?: string | null;
  welcome_message?: string | null;
}

export interface ListenData {
  pupil_name: string;
  class_name: string;
  sentence: string;
  audio_url: string;
  audio_mime: string | null;
  classroom_name: string;
  teacher_name?: string | null;
  teacher_photo_url?: string | null;
}

export interface LoginResult {
  token: string;
  expires_at: number;
  teacher: TeacherProfile;
  first?: boolean;
}

export interface Api {
  mode: 'supabase' | 'demo';
  student: {
    home(): Promise<StudentHome>;
    verify(class_id: string, access_code: string): Promise<StudentConfig>;
    submit(p: SubmitPayload, onProgress?: (pct: number) => void): Promise<{ ok: true; id: string }>;
  };
  teacher: {
    teachers(): Promise<LoginTeacher[]>;
    register(p: ProfileInput & { school_code: string; pin: string }): Promise<LoginResult>;
    login(teacher_id: string, pin: string): Promise<LoginResult>;
    session(): Promise<{ ok: true; teacher: TeacherProfile }>;
    stats(): Promise<Stats>;
    list(f: { status?: Status | ''; class_name?: string }): Promise<Submission[]>;
    get(id: string): Promise<Submission>;
    setStatus(id: string, status: Status): Promise<void>;
    remove(id: string): Promise<void>;
    gallery(class_name?: string): Promise<Submission[]>;
    cards(f: { ids?: string[]; class_name?: string }): Promise<Submission[]>;
    getSettings(): Promise<TeacherSettings>;
    updateSettings(p: Partial<Pick<TeacherSettings, 'photo_required' | 'word_of_day' | 'challenge'>>): Promise<void>;
    updateProfile(p: ProfileInput): Promise<void>;
    setPhoto(dataUrl: string): Promise<void>;
    removePhoto(): Promise<void>;
    classAdd(name: string, access_code: string): Promise<void>;
    classUpdate(id: string, name: string, access_code: string): Promise<void>;
    classDelete(id: string): Promise<void>;
    wordAdd(category: Category, text: string, is_plural: boolean): Promise<void>;
    wordDelete(id: string): Promise<void>;
    changePin(current_pin: string, new_pin: string): Promise<void>;
    // school admin only
    schoolUpdate(p: { school_name?: string; registration_code?: string | null }): Promise<void>;
    resetTeacherPin(teacher_id: string, new_pin: string): Promise<void>;
    setAdmin(teacher_id: string, is_admin: boolean): Promise<void>;
    removeTeacher(teacher_id: string): Promise<void>;
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
