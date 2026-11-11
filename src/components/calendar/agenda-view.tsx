"use client";

import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import { CalendarCheck2, MapPin, Plus } from "lucide-react";
import { atNoon, dualTime, eventOccursOn, shiftDay, todayKey } from "@/lib/calendar/dates";
import { useCalendarStore } from "@/stores/calendar-store";
import { CompetitionLogo } from "./competition-logo";

export function AgendaView() {
  const date = useCalendarStore((s) => s.selectedDate);
  const zone = useCalendarStore((s) => s.timeZone);
  const localZone = useCalendarStore((s) => s.localTimeZone);
  const events = useCalendarStore((s) => s.events);
  const mode = useCalendarStore((s) => s.mode);
  const eventGroups = useCalendarStore((s) => s.eventGroups);
  const groupNames = useCalendarStore((s) => s.groupNames);
  const setDate = useCalendarStore((s) => s.setSelectedDate);
  const openEditor = useCalendarStore((s) => s.openEditor);
  const today = todayKey(zone);
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(date, i, zone));
  return <div className="agenda-container">
    <div className="view-intro"><p className="intro-kicker">AGENDA / 7 DAYS</p><div className="timezone-label">TIME ZONE / {zone.replaceAll("_", " ")}</div></div>
    {days.map((day) => {
      const daily = events.filter((event) => eventOccursOn(event, day, zone)).sort((a, b) => a.allDay ? (b.allDay ? 0 : -1) : b.allDay ? 1 : Date.parse(a.start) - Date.parse(b.start));
      return <section className="agenda-day" key={day}>
        <div className="agenda-date"><span>{format(atNoon(day, zone), "EEE", { in: tz(zone) })}</span><strong className={day === today ? "agenda-today" : ""}>{format(atNoon(day, zone), "d", { in: tz(zone) })}</strong><small>{format(atNoon(day, zone), "MMM", { in: tz(zone) })}</small></div>
        <div className="agenda-items">
          {daily.length ? daily.map((event) => <button key={event.id} className="agenda-event" onClick={() => { setDate(day); openEditor(event.id); }}>
            <CompetitionLogo competition={event.competition} />
            <span className={`agenda-event-bar status-${event.status}`} /><span className="agenda-event-text"><strong>{event.title}</strong><small>{event.classification} / {event.status.toUpperCase()} / TAG: {event.color.toUpperCase()}</small>{mode === "online" && <small>{eventGroups[event.id] ? `GROUP / ${groupNames[eventGroups[event.id] ?? ""] ?? "GROUP"}` : "PRIVATE"}</small>}<small>{event.allDay ? "ALL DAY" : dualTime(event.start, localZone)}{event.location && <> <span className="agenda-location"><MapPin size={12} /> {event.location}</span></>}</small></span><CalendarCheck2 size={17} />
          </button>) : <button className="agenda-empty" onClick={() => { setDate(day); openEditor(); }}><Plus size={14} aria-hidden="true" /> NEW OPERATION</button>}
        </div>
      </section>;
    })}
  </div>;
}
