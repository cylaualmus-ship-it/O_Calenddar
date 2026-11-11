"use client";

import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import { ArrowUpRight, ChevronLeft, ChevronRight, Crosshair, Home, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { atNoon, dualTime, eventOccursOn, getMonthDays, moveSelection, todayKey } from "@/lib/calendar/dates";
import { useCalendarStore } from "@/stores/calendar-store";
import { CompetitionCatalog } from "./competition-catalog";
import { CompetitionLogo } from "./competition-logo";

const weekdays = ["M", "T", "W", "T", "F", "S", "S"];

export function CalendarSidebar() {
  const date = useCalendarStore((s) => s.selectedDate);
  const zone = useCalendarStore((s) => s.timeZone);
  const localZone = useCalendarStore((s) => s.localTimeZone);
  const events = useCalendarStore((s) => s.events);
  const setDate = useCalendarStore((s) => s.setSelectedDate);
  const openEditor = useCalendarStore((s) => s.openEditor);
  const mode = useCalendarStore((s) => s.mode);
  const groupName = useCalendarStore((s) => s.groupName);
  const today = todayKey(zone);
  const upcoming = events.filter((event) => event.status === "active" || (eventOccursOn(event, today, zone) && (event.allDay || Date.parse(event.end) > Date.now())))
    .sort((a, b) => a.status === "active" && b.status !== "active" ? -1 : b.status === "active" && a.status !== "active" ? 1 : a.allDay ? (b.allDay ? 0 : -1) : b.allDay ? 1 : Date.parse(a.start) - Date.parse(b.start));

  return (
    <div className="sidebar-content">
      <div className="brand"><div className="brand-icon"><Crosshair size={20} aria-hidden="true" /></div><div><strong>OPS CALENDAR</strong><small>COMPETITION PLANNING</small></div></div>
      <Link href="/" className="dashboard-link"><Home size={14} aria-hidden="true" /> HOME</Link>
      <p className="calendar-context">{mode === "local" ? "DEVICE CALENDAR" : groupName ? `GROUP / ${groupName}` : "MY PRIVATE CALENDAR"}</p>
      <Button variant="ghost" className="create-button" onClick={() => openEditor()}><Plus size={18} aria-hidden="true" /><span>NEW OPERATION</span><kbd>C</kbd></Button>
      <CompetitionCatalog />
      <div className="sidebar-section">
        <div className="mini-heading"><strong>{format(atNoon(date, zone), "MMMM yyyy", { in: tz(zone) })}</strong><div><button className="icon-button small" aria-label="Previous month" onClick={() => setDate(moveSelection(date, "month", -1, zone))}><ChevronLeft size={15} /></button><button className="icon-button small" aria-label="Next month" onClick={() => setDate(moveSelection(date, "month", 1, zone))}><ChevronRight size={15} /></button></div></div>
        <div className="mini-grid">{weekdays.map((day, i) => <span className="mini-weekday" key={`${day}-${i}`}>{day}</span>)}
          {getMonthDays(date, zone).map((day) => <button key={day} onClick={() => setDate(day)} aria-label={format(atNoon(day, zone), "EEEE, MMMM d, yyyy", { in: tz(zone) })} aria-pressed={day === date} className={`mini-day ${day.slice(0, 7) !== date.slice(0, 7) ? "outside" : ""} ${day === date ? "selected" : ""} ${day === today ? "is-today" : ""}`}>{Number(day.slice(-2))}</button>)}
        </div>
      </div>
      <div className="sidebar-divider" />
      <div className="sidebar-section upcoming-section">
        <div className="section-label"><span>OPERATIONS</span><span className="today-label">{mode === "local" ? "DEVICE" : "ONLINE"}</span></div>
        <h2>ACTIVE / TODAY <span>{upcoming.length}</span></h2>
        <div className="upcoming-list">
          {upcoming.length === 0 ? <p className="empty-sidebar">NOTHING SCHEDULED</p> : upcoming.map((event) => (
            <button key={event.id} className="upcoming-item" onClick={() => openEditor(event.id)}>
              <CompetitionLogo competition={event.competition} />
              <span className={`event-dot status-${event.status}`} />
              <span className="upcoming-text"><strong>{event.title}</strong><small>{event.classification} / {event.status.toUpperCase()}</small><small>{event.allDay ? "ALL DAY" : dualTime(event.start, localZone)}</small></span>
              <ArrowUpRight size={14} className="upcoming-arrow" />
            </button>
          ))}
        </div>
      </div>
      <div className="sidebar-footer"><div><strong>{mode === "local" ? "DEVICE CALENDAR" : "ONLINE CALENDAR"}</strong><p>{mode === "local" ? "NOT SYNCED TO OTHER DEVICES" : "GROUP OPERATIONS SHOW IN MY CALENDAR"}</p></div></div>
    </div>
  );
}
