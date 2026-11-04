// Run with:  deno test --allow-env supabase/functions/_shared/
import { hashPin, pinFingerprint, readSession, signSession, verifyPin } from './util.ts';
import { agreementOk, buildSentence, challengeMet, checkQuality, fixAgreement } from './sentence.ts';

function assert(v: unknown, msg = 'assertion failed'): asserts v {
  if (!v) throw new Error(msg);
}
const assertFalse = (v: unknown) => assert(!v, `expected falsy, got ${v}`);
function assertEquals(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

Deno.env.set('TEACHER_SESSION_SECRET', 'test-secret-that-is-long-enough-1234567890');

Deno.test('PIN hash verifies only the right PIN', async () => {
  const h = await hashPin('4821');
  assert(h.startsWith('pbkdf2$'));
  assert(await verifyPin('4821', h));
  assertFalse(await verifyPin('4822', h));
  assertFalse(await verifyPin('4821', 'garbage'));
});

Deno.test('session tokens: valid, tampered, expired, PIN-changed', async () => {
  const pv = await pinFingerprint(null);
  const t = await signSession({ sub: 'teacher', exp: Date.now() / 1000 + 60, pv });
  assertEquals((await readSession(t))?.pv, pv);
  const [body, sig] = t.split('.');
  assertEquals(await readSession(body + 'x.' + sig), null);
  assertEquals(await readSession(body + '.' + sig.slice(0, -2) + 'AA'), null);
  const old = await signSession({ sub: 'teacher', exp: Date.now() / 1000 - 1, pv });
  assertEquals(await readSession(old), null);
  assert((await pinFingerprint('pbkdf2$1$a$b')) !== pv, 'changing the PIN changes the fingerprint');
});

Deno.test('sentence building and grammar helpers', () => {
  assertEquals(buildSentence({ who: 'Aina', what: 'is reading a book', where: 'in the library', when: 'after school' }), 'Aina is reading a book in the library after school.');
  assertEquals(buildSentence({ who: 'my friends', what: 'are singing a song.', where: 'in the classroom', when: 'every day' }), 'My friends are singing a song in the classroom every day.');
  assertEquals(agreementOk('is reading', true), false);
  assertEquals(agreementOk('are reading', true), true);
  assertEquals(agreementOk('ate rice', true), null);
  assertEquals(fixAgreement('is reading a book', true), 'are reading a book');
  assertEquals(fixAgreement('are planting flowers', false), 'is planting flowers');
  assert(checkQuality({ who: 'Aina' }, false).some((c) => !c.ok));
  assert(challengeMet('The cat is in the garden.', { title: 'Use garden', required_word: 'garden' }));
  assertFalse(challengeMet('The cat is in the gardens.', { title: 'Use garden', required_word: 'garden' }));
  assertFalse(challengeMet('Aina is reading.', { title: 'Longer', min_words: 10 }));
});
