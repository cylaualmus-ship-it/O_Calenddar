import { getDayBounds, shiftDay, toDayKey } from "./dates";
import type { CalendarEvent, DayKey, TimedEvent } from "@/types/calendar";

export const SNAP_MINUTES = 15;
export const SNAP_MS = SNAP_MINUTES * 60_000;

export interface PositionedEvent {
  event: TimedEvent;
  start: number;
  end: number;
  column: number;
  columns: number;
}

export interface SpanningEvent {
  event: CalendarEvent;
  firstColumn: number;
  span: number;
  row: number;
}

export function isSpanning(event: CalendarEvent, zone: string): boolean {
  return event.allDay || toDayKey(new Date(event.start), zone) !== toDayKey(new Date(Date.parse(event.end) - 1), zone);
}

export function layoutDay(events: TimedEvent[], day: DayKey, zone: string): PositionedEvent[] {
  const bounds = getDayBounds(day, zone);
  const items = events.map((event) => ({
    event,
    start: Math.max(Date.parse(event.start), bounds.start),
    end: Math.min(Date.parse(event.end), bounds.end),
  })).filter((item) => item.start < item.end)
    .sort((a, b) => a.start - b.start || b.end - a.end || a.event.id.localeCompare(b.event.id));

  const result: PositionedEvent[] = [];
  let group: PositionedEvent[] = [];
  let groupEnd = -Infinity;
  let columnEnds: number[] = [];

  function flush() {
    for (const item of group) result.push({ ...item, columns: columnEnds.length });
    group = [];
    columnEnds = [];
    groupEnd = -Infinity;
  }

  for (const item of items) {
    if (item.start >= groupEnd && group.length) flush();
    let column = columnEnds.findIndex((end) => end <= item.start);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = item.end;
    group.push({ ...item, column, columns: 0 });
    groupEnd = Math.max(groupEnd, item.end);
  }
  flush();
  return result;
}

export function layoutSpanning(events: CalendarEvent[], days: DayKey[], zone: string): SpanningEvent[] {
  if (!days.length) return [];
  const last = days[days.length - 1];
  const segments = events.filter((event) => isSpanning(event, zone)).map((event) => {
    const firstDay = event.allDay ? event.startDate : toDayKey(new Date(event.start), zone);
    const lastDay = event.allDay ? shiftDay(event.endDate, -1, zone) : toDayKey(new Date(Date.parse(event.end) - 1), zone);
    const firstColumn = days.findIndex((day) => day >= firstDay);
    const lastColumn = days.findIndex((day) => day >= lastDay);
    if (lastDay < days[0] || firstDay > last || firstColumn < 0) return null;
    const endColumn = lastColumn < 0 ? days.length - 1 : lastColumn;
    return { event, firstColumn, span: endColumn - firstColumn + 1 };
  }).filter((segment): segment is NonNullable<typeof segment> => segment !== null)
    .sort((a, b) => a.firstColumn - b.firstColumn || b.span - a.span || a.event.id.localeCompare(b.event.id));

  const rowEnds: number[] = [];
  return segments.map((segment) => {
    let row = rowEnds.findIndex((end) => end < segment.firstColumn);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = segment.firstColumn + segment.span - 1;
    return { ...segment, row };
  });
}

export function moveTimed(event: TimedEvent, dayShift: number, stepShift: number, zone: string): TimedEvent {
  const start = Date.parse(event.start);
  const originalDay = toDayKey(new Date(start), zone);
  const source = getDayBounds(originalDay, zone);
  const target = getDayBounds(shiftDay(originalDay, dayShift, zone), zone);
  const snappedOffset = Math.round((start - source.start) / SNAP_MS) * SNAP_MS;
  const nextStart = target.start + snappedOffset + stepShift * SNAP_MS;
  if (nextStart < target.start || nextStart >= target.end) {
    throw new RangeError("The target time is outside the selected day.");
  }
  const duration = Date.parse(event.end) - start;
  return { ...event, start: new Date(nextStart).toISOString(), end: new Date(nextStart + duration).toISOString() };
}

export function resizeTimed(event: TimedEvent, stepShift: number, zone: string): TimedEvent {
  const previousEnd = Date.parse(event.end);
  const bounds = getDayBounds(toDayKey(new Date(previousEnd), zone), zone);
  const end = bounds.start + Math.round((previousEnd - bounds.start) / SNAP_MS) * SNAP_MS + stepShift * SNAP_MS;
  if (end - Date.parse(event.start) < SNAP_MS) throw new RangeError("An operation must be at least 15 minutes long.");
  return { ...event, end: new Date(end).toISOString() };
}

export function moveSpanning(event: CalendarEvent, dayShift: number, zone: string): CalendarEvent {
  if (event.allDay) return { ...event, startDate: shiftDay(event.startDate, dayShift, zone), endDate: shiftDay(event.endDate, dayShift, zone) };
  return moveTimed(event, dayShift, 0, zone);
}

export function resizeSpanning(event: CalendarEvent, dayShift: number, zone: string): CalendarEvent {
  if (event.allDay) {
    const endDate = shiftDay(event.endDate, dayShift, zone);
    if (endDate <= event.startDate) throw new RangeError("An all-day operation must last at least one day.");
    return { ...event, endDate };
  }
  const end = Date.parse(event.end);
  const endDay = toDayKey(new Date(end), zone);
  const source = getDayBounds(endDay, zone);
  const target = getDayBounds(shiftDay(endDay, dayShift, zone), zone);
  const nextEnd = target.start + (end - source.start);
  if (nextEnd >= target.end) throw new RangeError("The target time is outside the selected day.");
  if (nextEnd - Date.parse(event.start) < SNAP_MS) throw new RangeError("An operation must be at least 15 minutes long.");
  return { ...event, end: new Date(nextEnd).toISOString() };
}
