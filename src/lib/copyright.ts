// ─────────────────────────────────────────────────────────────────────────
//  Copyright notice shown across the app and on printed cards.
//  This is set in the code on purpose: teachers and admins cannot change it
//  from the Teacher Zone. Only the owner of the GitHub repository can edit it.
// ─────────────────────────────────────────────────────────────────────────
export const COPYRIGHT = {
  owner: 'Nurhajrina Jarawi',
  year: 2026,
  terms: 'Free for teachers to use in class with permission. Do not copy, modify, sell or redistribute.',
};

const years = () => {
  const now = new Date().getFullYear();
  return now > COPYRIGHT.year ? `${COPYRIGHT.year}–${now}` : String(COPYRIGHT.year);
};

/** e.g. "© 2026 Nurhajrina Jarawi. All rights reserved." */
export const copyrightLine = () => `© ${years()} ${COPYRIGHT.owner}. All rights reserved.`;

/** Short form for printed cards, e.g. "© 2026 Nurhajrina Jarawi" */
export const copyrightShort = () => `© ${years()} ${COPYRIGHT.owner}`;
