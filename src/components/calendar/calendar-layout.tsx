"use client";

import { useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Menu, Plus, RefreshCw, X } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { calendarTitle, moveSelection } from "@/lib/calendar/dates";
import { useCalendarStore } from "@/stores/calendar-store";

export function CalendarLayout({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const date = useCalendarStore((s) => s.selectedDate);
  const view = useCalendarStore((s) => s.view);
  const timeZone = useCalendarStore((s) => s.timeZone);
  const localTimeZone = useCalendarStore((s) => s.localTimeZone);
  const timeMode = useCalendarStore((s) => s.timeMode);
  const setTimeMode = useCalendarStore((s) => s.setTimeMode);
  const setDate = useCalendarStore((s) => s.setSelectedDate);
  const setView = useCalendarStore((s) => s.setView);
  const today = useCalendarStore((s) => s.goToToday);
  const openEditor = useCalendarStore((s) => s.openEditor);
  const storageAvailable = useCalendarStore((s) => s.storageAvailable);
  const mode = useCalendarStore((s) => s.mode);
  const busy = useCalendarStore((s) => s.busy);
  const refreshOnline = useCalendarStore((s) => s.refreshOnline);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const localClock = now ? formatInTimeZone(now, localTimeZone, "HH:mm:ss") : "--:--:--";
  const utcClock = now ? formatInTimeZone(now, "UTC", "HH:mm:ss") : "--:--:--";

  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">{sidebar}</aside>
      <div className="main-shell">
        <header className="topbar">
          <Dialog.Root open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <Dialog.Trigger asChild><button className="icon-button mobile-menu" aria-label="Open navigation"><Menu size={20} /></button></Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="drawer">
                <Dialog.Title className="sr-only">Calendar navigation</Dialog.Title>
                <Dialog.Close asChild><button className="icon-button drawer-close" aria-label="Close navigation"><X size={18} /></button></Dialog.Close>
                {sidebar}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <div className="header-title">
            <span className="header-eyebrow">OPERATIONS / {view.toUpperCase()}</span>
            <h1>{calendarTitle(date, view, timeZone)}</h1>
          </div>
          <div className="header-actions">
            <button className="today-button" onClick={today}>TODAY</button>
            {mode === "online" && <button className="icon-button" aria-label="Refresh calendar" title="Refresh calendar" onClick={() => void refreshOnline()} disabled={busy}><RefreshCw size={16} aria-hidden="true" /></button>}
            <div className="navigation-buttons">
              <button className="icon-button" aria-label="Previous period" onClick={() => setDate(moveSelection(date, view, -1, timeZone))}><ChevronLeft size={18} /></button>
              <button className="icon-button" aria-label="Next period" onClick={() => setDate(moveSelection(date, view, 1, timeZone))}><ChevronRight size={18} /></button>
            </div>
            <div className="view-selector">
              <CalendarDays className="view-icon" size={16} />
              <select className="view-trigger" aria-label="Calendar view" value={view} onChange={(event) => {
                if (event.target.value === "month" || event.target.value === "agenda" || event.target.value === "week" || event.target.value === "day") setView(event.target.value);
              }}>
                <option value="month">MONTH / STRATEGIC</option>
                <option value="agenda">AGENDA / LOG</option>
                <option value="week">WEEK / TACTICAL</option>
                <option value="day">DAY / TACTICAL</option>
              </select>
              <ChevronDown className="view-chevron" size={14} />
            </div>
            <div className="time-mode" role="group" aria-label="Primary time display">
              <button onClick={() => setTimeMode("local")} aria-pressed={timeMode === "local"}>LOCAL</button>
              <button onClick={() => setTimeMode("utc")} aria-pressed={timeMode === "utc"}>UTC</button>
            </div>
            <div className="dual-clock" aria-label={`Local time ${localClock}; Zulu time ${utcClock}`}>
              <span className={timeMode === "local" ? "primary-time" : ""}>{localClock} L</span>
              <span aria-hidden="true"> | </span>
              <span className={timeMode === "utc" ? "primary-time" : ""}>{utcClock} Z</span>
            </div>
            <button className="mobile-create" onClick={() => openEditor()} aria-label="New operation" title="New operation"><Plus size={19} aria-hidden="true" /></button>
          </div>
        </header>
        {!storageAvailable && <div className="storage-warning" role="alert">Your calendar data could not be loaded. Editing is disabled. Return home to check your sign-in or setup.</div>}
        <main className="calendar-main">{children}</main>
      </div>
    </div>
  );
}
