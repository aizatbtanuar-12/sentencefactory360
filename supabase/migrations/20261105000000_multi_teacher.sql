-- =====================================================================
--  Sentence Factory 360° — multiple teachers with profiles
--  Run AFTER 20261104000000_sentence_factory.sql (safe to run again).
--
--  * Each teacher has a profile (title, name, school, subject, welcome
--    message, photo) and their own PIN.
--  * Classes, word bank, Word of the Day, Challenge and submissions now
--    belong to a teacher. Teachers only ever see their own.
--  * Teachers sign themselves up with the SCHOOL CODE. Until an admin
--    sets one, the school code is the INITIAL_TEACHER_PIN secret.
--  * The first teacher to sign up becomes the admin and takes over any
--    classes/submissions created before this migration.
-- =====================================================================

create table if not exists public.teachers (
  id               uuid primary key default gen_random_uuid(),
  title            text not null default 'Teacher',
  name             text not null,
  school           text,
  subject          text,
  welcome_message  text,
  photo_path       text,
  pin_hash         text,                     -- null = log in once with INITIAL_TEACHER_PIN, then set a PIN
  is_admin         boolean not null default false,
  photo_required   boolean not null default true,
  word_of_day      jsonb,
  challenge        jsonb,
  created_at       timestamptz not null default now(),
  constraint teachers_name_len check (char_length(name) between 1 and 40),
  constraint teachers_title_len check (char_length(title) between 1 and 20)
);

-- School-wide settings
alter table public.app_settings add column if not exists registration_code text;
comment on column public.app_settings.classroom_name is 'School / site name shown on the welcome screen';

-- Classes belong to a teacher; names only need to be unique per teacher
alter table public.classes add column if not exists teacher_id uuid references public.teachers(id) on delete cascade;
drop index if exists public.classes_name_unique;
create unique index if not exists classes_teacher_name_unique on public.classes (teacher_id, lower(name));
create index if not exists classes_teacher_idx on public.classes (teacher_id);

-- Word bank: teacher_id NULL = the school's default words (copied to each new teacher)
alter table public.word_bank add column if not exists teacher_id uuid references public.teachers(id) on delete cascade;
drop index if exists public.word_bank_unique;
create unique index if not exists word_bank_teacher_unique
  on public.word_bank (coalesce(teacher_id, '00000000-0000-0000-0000-000000000000'::uuid), category, lower(text));

-- Submissions belong to the class's teacher
alter table public.submissions add column if not exists teacher_id uuid references public.teachers(id) on delete cascade;
create index if not exists submissions_teacher_idx on public.submissions (teacher_id, status, created_at desc);

-- Lock down the new table like the others
alter table public.teachers enable row level security;
revoke all on public.teachers from anon, authenticated;
