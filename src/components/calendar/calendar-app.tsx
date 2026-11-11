"use client";

import { useEffect, useRef } from "react";
import { Toaster } from "sonner";
import { CalendarLayout } from "./calendar-layout";
import { CalendarSidebar } from "./calendar-sidebar";
import { MonthView } from "./month-view";
import { AgendaView } from "./agenda-view";
import { TimeGridView } from "./time-grid-view";
import { EventDialog } from "./event-dialog";
import { useCalendarStore } from "@/stores/calendar-store";
import { getSupabase } from "@/lib/supabase/client";

export function CalendarApp({ local, groupId }: { local: boolean; groupId: string | null }) {
  const initialized = useCalendarStore((s) => s.initialized);
  const initialize = useCalendarStore((s) => s.initialize);
  const initializeOnline = useCalendarStore((s) => s.initializeOnline);
  const refreshOnline = useCalendarStore((s) => s.refreshOnline);
  const clearOnlineSession = useCalendarStore((s) => s.clearOnlineSession);
  const view = useCalendarStore((s) => s.view);
  const editorOpen = useCalendarStore((s) => s.editorOpen);
  const mode = useCalendarStore((s) => s.mode);
  const activeGroupId = useCalendarStore((s) => s.activeGroupId);
  const openEditor = useCalendarStore((s) => s.openEditor);
  const goToToday = useCalendarStore((s) => s.goToToday);
  const setView = useCalendarStore((s) => s.setView);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    if (local) initialize(zone, mobile);
    else void initializeOnline(zone, mobile, groupId);
  }, [initialize, initializeOnline, local, groupId]);

  useEffect(() => {
    if (local) return;
    const client = getSupabase();
    if (!client) return;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      const currentUser = useCalendarStore.getState().userId;
      if (event === "SIGNED_OUT" || (event === "SIGNED_IN" && currentUser && session?.user.id !== currentUser)) {
        clearOnlineSession();
        window.location.assign("/");
      }
    });
    const refresh = () => {
      if (!useCalendarStore.getState().editorOpen) void refreshOnline();
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => { subscription.unsubscribe(); window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [local, refreshOnline, clearOnlineSession]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (editorOpen || event.metaKey || event.ctrlKey || event.altKey || event.repeat ||
        (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) ||
        document.querySelector('[role="dialog"]')) return;
      switch (event.key.toLowerCase()) {
        case "m": setView("month"); break;
        case "w": setView("week"); break;
        case "d": setView("day"); break;
        case "a": setView("agenda"); break;
        case "t": goToToday(); break;
        case "c": openEditor(); break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editorOpen, goToToday, openEditor, setView]);

  return (
    <>
      <Toaster theme="dark" position="bottom-right" />
      {initialized && mode === (local ? "local" : "online") && (local || activeGroupId === groupId) ? (
        <CalendarLayout sidebar={<CalendarSidebar />}>
          {view === "agenda" ? <AgendaView /> : view === "month" ? <MonthView /> : <TimeGridView />}
          <EventDialog />
        </CalendarLayout>
      ) : (
        <div className="loading-shell" role="status" aria-label="Loading calendar">
          <div className="loading-sidebar"><div className="skeleton h-9 w-36" /><div className="skeleton mt-14 h-12 w-full" /><div className="skeleton mt-10 h-48 w-full" /></div>
          <div className="loading-main"><div className="skeleton h-10 w-64" /><div className="skeleton mt-10 h-[70vh] w-full" /></div>
        </div>
      )}
    </>
  );
}
