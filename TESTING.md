# Testing checklist — Sentence Factory 360°

## A. What was tested before hand-over (4 Nov 2026)

| Check | How | Result |
|---|---|---|
| Frontend type-check + production build | `npm run build` (TypeScript strict + Vite) | ✅ no errors |
| Edge Functions type-check + lint | `deno check` / `deno lint` on all three functions | ✅ no errors |
| Server security logic | `deno test --allow-env supabase/functions/_shared/` — PIN hashing, signed sessions (tampered / expired / PIN-changed), sentence + grammar rules | ✅ 3/3 |
| Database migration | Run twice on PostgreSQL 16 with Supabase-style `anon`/`authenticated` roles | ✅ runs, re-runs safely, seeds 24 words + 1 class, bucket private; `anon` and `authenticated` get **permission denied** on every table |
| Full classroom workflow (single teacher) | Automated Chrome test in **demo mode** with fake camera + microphone at tablet size 1280×800 | ✅ 22/22 checks, 0 browser errors |
| Printed card | Chrome print-to-PDF of the card page | ✅ exactly 105 × 148 mm (A6), QR decodes to `/listen/<token>` |
| **Multiple teachers — server** (5 Nov 2026) | The real Edge Functions run against PostgreSQL 16 + PostgREST, starting from a database that already had single-teacher data. Script: `supabase/tests/multi_teacher_integration_test.py` | ✅ **62/62**: sign-up/school code, first teacher becomes admin and takes over old data, teachers can't see/open/approve/delete each other's submissions, classes or words, class codes only open their own class, admin-only actions refused for others, PIN reset signs out, removing a teacher deletes their files, lockout after 8 wrong PINs |
| **Multiple teachers — app** (5 Nov 2026) | Automated Chrome test in demo mode (`docs/e2e_demo_test.py`): two teachers, profile + photo, separate classes / word banks / submissions / cards / QR page, admin reset + remove | ✅ 24/24 checks, 0 browser errors |
| Second migration | Run twice on a database with existing data | ✅ safe to re-run; old class + submission adopted by the first teacher |

**Not yet tested — needs your Supabase project:** the three Edge Functions running against a live Supabase project (uploads to Storage, signed URLs, CORS), and a real Android tablet camera, microphone and printer. Run section B once after deploying.

## B. Checklist to run after deployment (about 10 minutes)

Use the classroom tablet in Chrome, on the real **https://** address.

| # | Test | Expected | ✓ |
|---|---|---|---|
| 1 | **Student enters details.** Welcome → *I'M A STUDENT* → type a name, tap the class, enter a **wrong** code → *Let's build!* | Friendly "code is not right" message. With the right code you reach the build screen. | ☐ |
| 2 | **Student builds a sentence.** Tap only WHO, then *Next: Photo*. Then pick *My friends* + *is reading a book*. | Blocked with "Pick WHAT is happening". The is/are hint shows, and *Fix it for me* changes it to "are reading". 🔊 reads it aloud. 🎲 makes a correct random sentence. | ☐ |
| 3 | **Student takes a photo.** Allow the camera → *Take my photo* (3-2-1) → *Retake* → take again. Also try *Upload a photo*. | Mirror preview, square photo shown, retake/remove work. | ☐ |
| 4 | **Student records their voice.** Allow the microphone → red button → read → square to stop → *Play my voice* → *Record again*. | The level bar moves while speaking. Playback is clear. Recording stops by itself at 30 s. | ☐ |
| 5 | **Student submits.** Double-tap *Send to my teacher*. | Progress bar, then "WELL DONE, NAME!" with badges. Teacher Zone shows **one** new submission, not two. | ☐ |
| 6 | **Teacher logs in securely.** Teacher Zone → tap your name → wrong PIN, then the correct PIN. | Wrong PIN refused. The correct one opens the Overview with your name and photo in the header. After 8 wrong tries you're locked out for 15 minutes. | ☐ |
| 7 | **Teacher views submissions.** Submissions → try each filter and the class drop-down. | The list shows name, class, sentence, time and status. | ☐ |
| 8 | **Teacher listens to recordings.** Open a submission → press play. | Photo shows. The audio plays with its correct length. | ☐ |
| 9 | **Teacher approves / rejects.** Approve one, reject another. | Badges update. Counts on the Overview update. *Printable card* is only enabled when approved. | ☐ |
| 10 | **Approved submission → A6 card.** *Printable card* → *Print* (A6, margins None, background graphics on) and *Download PDF*. | The card has the title, tagline, photo, name, class, MY SENTENCE, QR, "SCAN TO HEAR ME READ" and "My English is growing every day!". | ☐ |
| 11 | **QR opens the correct recording.** Scan the printed QR with a phone (mobile data, not signed in). | "Listen to NAME read!" with the right sentence. ▶ plays **that child's** voice. Rejecting the submission makes the QR show "not found". Approving again brings it back. | ☐ |
| 12 | **Next student starts clean.** After a submission, tap *Next student* → *I'M A STUDENT*. | Empty name and code, no word cards selected, no previous photo or recording. Also: leave a half-finished sentence for 4 minutes → the "Are you still building?" prompt appears, then it resets. | ☐ |
| 13 | **Offline.** Turn Wi-Fi off mid-way, then tap *Send*. | "No internet connection" banner and message. Turn Wi-Fi on → *Try again* → success, with no duplicate. | ☐ |
| 14 | **Settings.** Add a word, a class and code, a Word of the Day and a Challenge, then change the PIN. | A pupil sees the new word, Word of the Day and Challenge on the next turn. The old PIN stops working. | ☐ |
| 16 | **Second teacher.** Admin: Settings → School → set a school code. On the tablet: Teacher Zone → *New teacher? Sign up* with that code. Add a class, a word and a welcome message. | The new teacher sees **0** submissions and none of the admin's classes. Pupils see both classes, with teacher names. Each class code only opens its own class, with that teacher's words and message. | ☐ |
| 17 | **Admin tools.** Admin → School → Reset PIN for the second teacher, then try Remove. | The second teacher's old PIN stops working and the new one works. After removal, their class disappears from the pupils' list and their cards' QR codes say "not found". | ☐ |
| 15 | **Privacy.** On a different device, open `https://YOUR-PROJECT.supabase.co/rest/v1/submissions?select=*` with the anon key. | `permission denied` / empty. Pupils' data can't be read directly. | ☐ |

## C. Re-running the automated demo test

```bash
npm run build:demo && npx vite preview --mode demo --port 4173 &
pip install playwright && python -m playwright install chromium
python docs/e2e_demo_test.py     # edit executable_path in the script if Chrome is elsewhere
# start with a fresh browser profile: demo data lives in the browser's IndexedDB
```
