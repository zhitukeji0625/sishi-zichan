import { format } from "date-fns";

/** Parse `yyyy-MM-dd` as local calendar date (avoids UTC midnight shift). */
export function parseLocalDateString(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(year, month, day);
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) {
    return null;
  }
  return d;
}

/** Format a Date as local `yyyy-MM-dd` (for DB @db.Date fields displayed to users). */
export function formatLocalDate(value: Date): string {
  return format(value, "yyyy-MM-dd");
}
