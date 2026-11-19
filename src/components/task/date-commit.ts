/**
 * A native date input fires `change` on every keystroke once all segments hold a value, so typing the year
 * "2026" reports 0002, 0020, 0202 and then 2026. Only a cleared box or a four-digit year from 1000 on is a date
 * the user meant; the rest are typing in progress and must not be saved.
 *
 * Emptying one segment (Backspace on the day, say) also reports "", with `validity.badInput` set because the
 * other segments still hold values. Pass that flag as `incomplete`: such a box is being edited, not cleared.
 */
export function isCommittableDate(value: string, incomplete = false): boolean {
  if (value === "") return !incomplete;
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(value);
  return !!m && Number(m[1]) >= 1000;
}
