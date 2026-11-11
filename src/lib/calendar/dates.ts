import { addDays, addMonths, endOfWeek, format, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { TZDate, tz, tzScan } from "@date-fns/tz";
import { formatInTimeZone } from "date-fns-tz";
import type { CalendarEvent, CalendarView, DayKey } from "@/types/calendar";

export function atNoon(day: DayKey, timeZone: string): TZDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new RangeError(`Invalid calendar date: ${day}`);
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const date = Number(d);
  if (year < 100) throw new RangeError(`Unsupported calendar date: ${day}`);
  const result = TZDate.tz(timeZone, year, month - 1, date, 12);
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== date) {
    throw new RangeError(`Invalid calendar date: ${day}`);
  }
  return result;
}

export function toDayKey(date: Date, timeZone: string): DayKey {
  return format(date, "yyyy-MM-dd", { in: tz(timeZone) });
}

export function todayKey(timeZone: string): DayKey {
  return toDayKey(new Date(), timeZone);
}

export function shiftDay(day: DayKey, amount: number, timeZone: string): DayKey {
  return toDayKey(addDays(atNoon(day, timeZone), amount, { in: tz(timeZone) }), timeZone);
}

export function getWeekDays(day: DayKey, timeZone: string): DayKey[] {
  const context = tz(timeZone);
  const start = startOfWeek(atNoon(day, timeZone), { weekStartsOn: 1, in: context });
  return Array.from({ length: 7 }, (_, i) => toDayKey(addDays(start, i, { in: context }), timeZone));
}

export function getMonthDays(day: DayKey, timeZone: string): DayKey[] {
  const context = tz(timeZone);
  const first = startOfMonth(atNoon(day, timeZone), { in: context });
  const start = startOfWeek(first, { weekStartsOn: 1, in: context });
  return Array.from({ length: 42 }, (_, i) => toDayKey(addDays(start, i, { in: context }), timeZone));
}

export function moveSelection(day: DayKey, view: CalendarView, direction: -1 | 1, timeZone: string): DayKey {
  const date = atNoon(day, timeZone);
  const context = tz(timeZone);
  return toDayKey(
    view === "month" ? addMonths(date, direction, { in: context }) : addDays(date, direction * (view === "day" ? 1 : 7), { in: context }),
    timeZone,
  );
}

export function calendarTitle(day: DayKey, view: CalendarView, timeZone: string): string {
  const date = atNoon(day, timeZone);
  const context = tz(timeZone);
  if (view === "month") return format(date, "MMMM yyyy", { in: context });
  if (view === "day") return format(date, "EEEE, MMMM d, yyyy", { in: context });
  if (view === "agenda") return "Chronological log";
  const start = startOfWeek(date, { weekStartsOn: 1, in: context });
  const end = endOfWeek(date, { weekStartsOn: 1, in: context });
  const startPattern = format(start, "yyyy", { in: context }) === format(end, "yyyy", { in: context }) ? "MMM d" : "MMM d, yyyy";
  return `${format(start, startPattern, { in: context })} – ${format(end, "MMM d, yyyy", { in: context })}`;
}

export function eventOccursOn(event: CalendarEvent, day: DayKey, timeZone: string): boolean {
  if (event.allDay) return event.startDate <= day && event.endDate > day;
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  const bounds = getDayBounds(day, timeZone);
  return start < bounds.end && end > bounds.start;
}

export function getDayBounds(day: DayKey, timeZone: string): { start: number; end: number } {
  const nextDay = shiftDay(day, 1, timeZone);
  const start = startOfDay(atNoon(day, timeZone), { in: tz(timeZone) }).getTime();
  const end = startOfDay(atNoon(nextDay, timeZone), { in: tz(timeZone) }).getTime();
  if (end <= start) throw new RangeError(`Cannot represent calendar day ${day} in ${timeZone}.`);
  return { start, end };
}

export function localDateTimeToDate(value: string, timeZone: string): TZDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new RangeError("Enter a valid date and time.");
  const [, y, m, d, h, min] = match;
  atNoon(`${y}-${m}-${d}`, timeZone);
  const date = TZDate.tz(timeZone, Number(y), Number(m) - 1, Number(d), Number(h), Number(min));
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1 ||
      date.getDate() !== Number(d) || date.getHours() !== Number(h) || date.getMinutes() !== Number(min)) {
    throw new RangeError("This local time does not exist in your timezone.");
  }
  const transitions = tzScan(timeZone, {
    start: new Date(date.getTime() - 172800000),
    end: new Date(date.getTime() + 172800000),
  });
  for (const transition of transitions) {
    if (transition.change >= 0) continue;
    const difference = Math.abs(transition.change) * 60000;
    const alternatives = [date.getTime() - difference, date.getTime() + difference];
    if (alternatives.some((instant) => formatInTimeZone(instant, timeZone, "yyyy-MM-dd'T'HH:mm") === value)) {
      throw new RangeError("This time occurs twice during a clock change. Use UTC mode to choose an exact time.");
    }
  }
  return date;
}

export function localDateTime(iso: string, timeZone: string): string {
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm", { in: tz(timeZone) });
}

export function dualTime(iso: string, localTimeZone: string): string {
  const date = new Date(iso);
  return `${formatInTimeZone(date, localTimeZone, "yyyy-MM-dd HH:mm")} L | ${formatInTimeZone(date, "UTC", "yyyy-MM-dd HH:mm")} Z`;
}
