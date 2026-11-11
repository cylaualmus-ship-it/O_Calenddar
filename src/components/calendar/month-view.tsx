"use client";

import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import { atNoon, eventOccursOn, getMonthDays, todayKey } from "@/lib/calendar/dates";
import { useCalendarStore } from "@/stores/calendar-store";
import { CompetitionLogo } from "./competition-logo";

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function MonthView() {
  const date = useCalendarStore((s) => s.selectedDate);
  const zone = useCalendarStore((s) => s.timeZone);
  const events = useCalendarStore((s) => s.events);
  const mode = useCalendarStore((s) => s.mode);
  const eventGroups = useCalendarStore((s) => s.eventGroups);
  const groupNames = useCalendarStore((s) => s.groupNames);
  const setDate = useCalendarStore((s) => s.setSelectedDate);
  const setView = useCalendarStore((s) => s.setView);
  const openEditor = useCalendarStore((s) => s.openEditor);
  const today = todayKey(zone);
  const days = getMonthDays(date, zone);

  return (
    <div key={date.slice(0, 7)} className="month-container">
      <div className="view-intro"><p className="intro-kicker">MONTH / STRATEGIC</p><div className="timezone-label">TIME ZONE / {zone.replaceAll("_", " ")}</div></div>
      <div className="month-grid">
        {weekdays.map((day) => <div key={day} className="weekday-heading"><span className="weekday-long">{day}</span><span className="weekday-short">{day.slice(0, 3)}</span></div>)}
        {days.map((day) => {
          const daily = events.filter((event) => eventOccursOn(event, day, zone))
            .sort((a, b) => a.allDay ? (b.allDay ? 0 : -1) : b.allDay ? 1 : Date.parse(a.start) - Date.parse(b.start));
          return <div key={day} className={`month-cell ${day.slice(0, 7) !== date.slice(0, 7) ? "other-month" : ""} ${day === date ? "selected-cell" : ""}`}>
            <button className={`date-number ${day === today ? "date-today" : ""}`} onClick={() => setDate(day)} aria-label={`Select ${format(atNoon(day, zone), "EEEE, MMMM d, yyyy", { in: tz(zone) })}`} aria-pressed={day === date}>{Number(day.slice(-2))}</button>
            <div className="cell-events">
              {daily.slice(0, 3).map((event) => {
                const groupId = eventGroups[event.id];
                const scope = mode === "local" ? "device calendar" : groupId ? `group ${groupNames[groupId] ?? "unknown"}` : "private";
                return <button className="event-pill" key={event.id} onClick={() => { setDate(day); openEditor(event.id); }} title={`${event.title} / ${scope} / ${event.classification} / ${event.status}`} aria-label={`${event.title}, ${scope}, ${event.classification}, ${event.status}, display tag ${event.color}`}><CompetitionLogo competition={event.competition} /><span className={`event-dot status-${event.status}`} /><span className={`tag-dot ${event.color}`} aria-hidden="true" /><span>{event.title}</span>{groupId && <small aria-hidden="true">[G]</small>}</button>;
              })}
              {daily.length > 3 && <button className="more-events" onClick={() => { setDate(day); setView("agenda"); }}>+ {daily.length - 3} more</button>}
            </div>
            <button className="cell-add" aria-label={`New operation on ${day}`} onClick={() => { setDate(day); openEditor(); }}>+</button>
          </div>;
        })}
      </div>
      <div className="calendar-footnote"><span>{mode === "local" ? "DEVICE CALENDAR // NOT SYNCED" : "[G] GROUP // REFRESHES EVERY 15 SECONDS"}</span><span><kbd>C</kbd> NEW OPERATION</span></div>
    </div>
  );
}
