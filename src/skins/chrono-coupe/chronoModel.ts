/** Pure helpers for the Chrono Coupe HUD (no DOM). */
export const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Jump threshold per display unit (mph: 88, km/h: 142). Configurable value, not a label. */
export const JUMP_THRESHOLD = { mph: 88, kph: 142 } as const;

/** Default destination: Jul 04 1976, 09:30 PM local. */
export const defaultDestination = () => new Date(1976, 6, 4, 21, 30, 0, 0);

export interface BankParts {
  month: string;
  day: string;
  year: string;
  hour: string;
  minute: string;
  pm: boolean;
  spoken: string;
}

export function bankParts(d: Date): BankParts {
  const h24 = d.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const pm = h24 >= 12;
  const minute = String(d.getMinutes()).padStart(2, '0');
  return {
    month: MONTHS[d.getMonth()],
    day: String(d.getDate()).padStart(2, '0'),
    year: String(d.getFullYear()).padStart(4, '0'),
    hour: String(h12).padStart(2, '0'),
    minute,
    pm,
    spoken: `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${h12}:${minute} ${pm ? 'PM' : 'AM'}`,
  };
}

export function readStoredDate(key: string): Date | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

export function storeDate(key: string, d: Date): void {
  try {
    localStorage.setItem(key, d.toISOString());
  } catch {
    /* session only */
  }
}

export const daysInMonth = (year: number, month0: number) => new Date(year, month0 + 1, 0).getDate();

/** Build a valid local date from editor fields (12-hour clock), clamping the day. */
export function composeDate(f: { year: number; month0: number; day: number; hour12: number; minute: number; pm: boolean }): Date {
  const year = Math.max(1, Math.min(9999, Math.round(f.year)));
  const month0 = ((Math.round(f.month0) % 12) + 12) % 12;
  const day = Math.max(1, Math.min(daysInMonth(year, month0), Math.round(f.day)));
  const h12 = Math.max(1, Math.min(12, Math.round(f.hour12)));
  const minute = Math.max(0, Math.min(59, Math.round(f.minute)));
  const d = new Date(2000, 0, 1, 0, 0, 0, 0);
  d.setFullYear(year, month0, day);
  d.setHours((h12 % 12) + (f.pm ? 12 : 0), minute, 0, 0);
  return d;
}
