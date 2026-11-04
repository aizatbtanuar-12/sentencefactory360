# Deploying the Edge Functions from the Supabase dashboard (no command line needed)

Each file here is a complete, single-file copy of one Edge Function.

Repeat for **student**, **teacher** and **listen**:

1. Supabase Dashboard → your project → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Name it exactly `student`, `teacher` or `listen` (lower case). The app calls these names.
3. Delete the sample code in the editor, open the matching file here (e.g. `teacher.ts`) on GitHub, click **Raw**, copy everything, and paste it in.
4. Click **Deploy function**.
5. Open the function → **Details / Settings** → turn **Enforce JWT verification** **OFF** → Save.

Then check **Edge Functions → Secrets** has `INITIAL_TEACHER_PIN`, `TEACHER_SESSION_SECRET` and (optionally) `ALLOWED_ORIGINS`.

> These files are generated from `supabase/functions/*/index.ts` + `supabase/functions/_shared/*.ts`.
> If you change the source, regenerate them (or deploy with the CLI: `supabase functions deploy <name> --no-verify-jwt`).
