import { TZDate } from "@date-fns/tz";
import { atNoon, shiftDay } from "./dates";
import { isCompetitionDetails } from "./competitions";
import type { CalendarEvent, DayKey } from "@/types/calendar";

export function sampleEvents(today: DayKey, timeZone: string): CalendarEvent[] {
  const makeTime = (day: DayKey, hour: number, minute: number) => {
    const [year, month, date] = day.split("-").map(Number);
    return TZDate.tz(timeZone, year, month - 1, date, hour, minute).toISOString();
  };
  const tomorrow = shiftDay(today, 1, timeZone);
  const later = shiftDay(today, 3, timeZone);
  const metadata = { classification: "TLP:CLEAR" as const, status: "pending" as const };
  return [
    { ...metadata, id: "sample-1", title: "Review security alerts", description: "Sample operation", location: "", color: "violet", allDay: false, start: makeTime(today, 9, 0), end: makeTime(today, 10, 0) },
    { ...metadata, id: "sample-2", title: "Incident briefing", description: "Sample operation", location: "Operations room", color: "blue", allDay: false, start: makeTime(today, 14, 0), end: makeTime(today, 15, 0) },
    { ...metadata, id: "sample-3", title: "Monitoring window", description: "Sample operation", location: "", color: "green", allDay: true, startDate: tomorrow, endDate: shiftDay(tomorrow, 1, timeZone) },
    { ...metadata, id: "sample-4", title: "Threat intelligence review", description: "Sample operation", location: "", color: "orange", allDay: false, start: makeTime(later, 11, 0), end: makeTime(later, 12, 0) },
  ];
}

export const colorNames = ["violet", "blue", "green", "orange", "rose"] as const;
export const classifications = ["TLP:CLEAR", "TLP:GREEN", "TLP:AMBER", "TLP:RED"] as const;
export const operationStatuses = ["pending", "active", "completed", "aborted"] as const;

export function readStoredEvent(value: unknown): CalendarEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const legacy = !("classification" in record) && !("status" in record);
  const candidate = legacy ? { ...record, classification: "TLP:CLEAR", status: "pending" } : record;
  return isCalendarEvent(candidate) ? candidate : null;
}

export function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  if (event.competition !== undefined && !isCompetitionDetails(event.competition)) return false;
  if (typeof event.id !== "string" || typeof event.title !== "string" || !event.title.trim() ||
      typeof event.description !== "string" || typeof event.location !== "string" ||
      typeof event.color !== "string" || !colorNames.some((color) => color === event.color) ||
      typeof event.classification !== "string" || !classifications.some((item) => item === event.classification) ||
      typeof event.status !== "string" || !operationStatuses.some((item) => item === event.status)) return false;
  if (event.allDay === true) {
    if (typeof event.startDate !== "string" || typeof event.endDate !== "string") return false;
    try {
      atNoon(event.startDate, "UTC");
      atNoon(event.endDate, "UTC");
      return event.endDate > event.startDate;
    } catch { return false; }
  }
  return event.allDay === false && typeof event.start === "string" && typeof event.end === "string" &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(event.start) && /(?:Z|[+-]\d{2}:\d{2})$/.test(event.end) &&
    Number.isFinite(Date.parse(event.start)) && Date.parse(event.end) > Date.parse(event.start);
}
