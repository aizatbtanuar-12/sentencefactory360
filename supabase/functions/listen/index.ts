// Public "Scan to hear me read" endpoint used by the QR code on printed cards.
// The QR code holds a long random share token (not a signed URL), so it never expires.
// Each scan gets a fresh, short-lived signed URL for the audio — and only while the
// teacher keeps the submission APPROVED. Rejecting or deleting a card disables its QR code.
import { admin, BUCKET, HttpError, json, must, serve, str } from '../_shared/util.ts';

serve(async (req) => {
  let token = '';
  if (req.method === 'POST') token = str((await req.json().catch(() => ({}))).token, 64);
  else token = str(new URL(req.url).searchParams.get('t'), 64);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new HttpError(404, 'This recording could not be found.');

  const db = admin();
  const row = must(
    await db
      .from('submissions')
      .select('pupil_name, class_name, sentence, audio_path, audio_mime, status')
      .eq('share_token', token)
      .maybeSingle(),
  ) as { pupil_name: string; class_name: string; sentence: string; audio_path: string; audio_mime: string | null; status: string } | null;

  if (!row || row.status !== 'approved') throw new HttpError(404, 'This recording could not be found.');

  const signed = await db.storage.from(BUCKET).createSignedUrl(row.audio_path, 30 * 60);
  if (signed.error || !signed.data) throw new HttpError(500, 'Could not load the recording. Please try again.');

  const settings = must(await db.from('app_settings').select('classroom_name').eq('id', 1).single()) as {
    classroom_name: string;
  };

  return json(req, {
    pupil_name: row.pupil_name,
    class_name: row.class_name,
    sentence: row.sentence,
    audio_url: signed.data.signedUrl,
    audio_mime: row.audio_mime,
    classroom_name: settings.classroom_name,
  });
});
