import { create } from "zustand";
import { toast } from "sonner";
import { atNoon, todayKey } from "@/lib/calendar/dates";
import { isCalendarEvent, readStoredEvent, sampleEvents } from "@/lib/calendar/events";
import { recommendedCompetitionEvents } from "@/lib/calendar/competitions";
import { getSupabase } from "@/lib/supabase/client";
import type { CalendarEvent, CalendarView, DayKey, TimeMode } from "@/types/calendar";

const STORAGE_KEY = "daymark.events.v1";
let contextVersion = 0;

interface CalendarState {
  events: CalendarEvent[];
  selectedDate: DayKey;
  view: CalendarView;
  timeZone: string;
  localTimeZone: string;
  timeMode: TimeMode;
  initialized: boolean;
  storageAvailable: boolean;
  mode: "local" | "online";
  activeGroupId: string | null;
  groupName: string | null;
  userId: string | null;
  eventGroups: Record<string, string | null>;
  groupNames: Record<string, string>;
  busy: boolean;
  importingCompetitions: boolean;
  editorOpen: boolean;
  editingEventId: string | null;
  draftSlot: { start: string; end: string } | null;
  draftEvent: CalendarEvent | null;
  initialize: (timeZone: string, mobile: boolean) => void;
  initializeOnline: (timeZone: string, mobile: boolean, groupId: string | null) => Promise<void>;
  refreshOnline: () => Promise<void>;
  clearOnlineSession: () => void;
  setSelectedDate: (date: DayKey) => void;
  setView: (view: CalendarView) => void;
  setTimeMode: (mode: TimeMode) => void;
  goToToday: () => void;
  openEditor: (eventId?: string) => void;
  openTemplate: (event: CalendarEvent) => void;
  openSlot: (start: string, end: string) => void;
  closeEditor: () => void;
  saveEvent: (event: CalendarEvent) => Promise<boolean>;
  addRecommendedCompetitions: () => Promise<{ added: number; complete: boolean }>;
  deleteEvent: (id: string) => Promise<boolean>;
}

function persist(events: CalendarEvent[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    return true;
  } catch {
    toast.error("Couldn't save changes. Check your device's storage settings.");
    return false;
  }
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  events: [],
  selectedDate: todayKey("UTC"),
  view: "month",
  timeZone: "UTC",
  localTimeZone: "UTC",
  timeMode: "utc",
  initialized: false,
  storageAvailable: false,
  mode: "local",
  activeGroupId: null,
  groupName: null,
  userId: null,
  eventGroups: {},
  groupNames: {},
  busy: false,
  importingCompetitions: false,
  editorOpen: false,
  editingEventId: null,
  draftSlot: null,
  draftEvent: null,

  initialize: (timeZone, mobile) => {
    if (get().initialized && get().mode === "local") return;
    contextVersion++;
    set({ events: [], initialized: false, storageAvailable: false, mode: "local", activeGroupId: null, groupName: null, userId: null, eventGroups: {}, groupNames: {}, busy: false, importingCompetitions: false, editorOpen: false });
    new Intl.DateTimeFormat("en-US", { timeZone });
    const selectedDate = todayKey("UTC");
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      let events: CalendarEvent[];
      if (saved === null) {
        events = sampleEvents(selectedDate, "UTC");
        if (!persist(events)) throw new Error("Unable to initialize storage.");
      } else {
        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed)) {
          throw new Error("Stored events are invalid.");
        }
        const normalized = parsed.map(readStoredEvent);
        if (normalized.some((event) => event === null)) throw new Error("Stored operations are invalid.");
        events = normalized.filter((event): event is CalendarEvent => event !== null);
      }
      set({ timeZone: "UTC", timeMode: "utc", localTimeZone: timeZone, selectedDate, view: mobile ? "agenda" : "month", events, initialized: true, storageAvailable: true });
    } catch {
      toast.error("Couldn't load operations. Existing storage was left untouched.");
      set({ timeZone: "UTC", timeMode: "utc", localTimeZone: timeZone, selectedDate, view: mobile ? "agenda" : "month", initialized: true, storageAvailable: false });
    }
  },
  initializeOnline: async (timeZone, mobile, groupId) => {
    new Intl.DateTimeFormat("en-US", { timeZone });
    const version = ++contextVersion;
    set({ events: [], eventGroups: {}, groupNames: {}, initialized: false, storageAvailable: false, mode: "online", activeGroupId: groupId, groupName: null, userId: null, busy: false, importingCompetitions: false,
      editorOpen: false, timeZone: "UTC", timeMode: "utc", localTimeZone: timeZone, selectedDate: todayKey("UTC"), view: mobile ? "agenda" : "month" });
    const client = getSupabase();
    if (!client) {
      toast.error("Online calendar is not configured. Return home for setup.");
      set({ initialized: true });
      return;
    }
    const { data: { user }, error } = await client.auth.getUser();
    if (version !== contextVersion) return;
    if (error || !user) {
      toast.error("Sign in on the home page to access your online calendar.");
      set({ initialized: true });
      return;
    }
    set({ userId: user.id });
    await get().refreshOnline();
    if (version === contextVersion) set({ initialized: true });
  },
  refreshOnline: async () => {
    const { activeGroupId, userId, busy, mode } = get();
    const version = contextVersion;
    const client = getSupabase();
    if (mode !== "online" || !client || !userId || busy) return;
    set({ busy: true });
    try {
      const { data: groups, error: groupError } = await client.from("competition_groups").select("id,name");
      if (groupError) throw groupError;
      const groupNames: Record<string, string> = {};
      for (const group of groups) groupNames[group.id] = group.name;
      if (activeGroupId && !Object.prototype.hasOwnProperty.call(groupNames, activeGroupId)) {
        if (version === contextVersion) set({ events: [], eventGroups: {}, groupNames: {}, groupName: null, storageAvailable: false });
        throw new Error("This group is unavailable or you are not a member.");
      }
      let query = client.from("operations").select("id,group_id,payload");
      if (activeGroupId) query = query.eq("group_id", activeGroupId);
      const { data, error } = await query;
      if (error) throw error;
      const events: CalendarEvent[] = [];
      const eventGroups: Record<string, string | null> = {};
      for (const row of data) {
        if (!isCalendarEvent(row.payload) || row.payload.id !== row.id || (row.group_id !== null && typeof row.group_id !== "string")) {
          throw new Error("An online operation contains invalid data. No changes were made.");
        }
        events.push(row.payload);
        eventGroups[row.id] = row.group_id;
      }
      if (version === contextVersion && get().mode === "online" && get().userId === userId && get().activeGroupId === activeGroupId) {
        set({ events, eventGroups, groupNames, groupName: activeGroupId ? groupNames[activeGroupId] : null, storageAvailable: true });
      }
    } catch (error) {
      if (version === contextVersion) toast.error(error instanceof Error ? error.message : "Couldn't load the online calendar.");
    } finally {
      if (version === contextVersion) set({ busy: false });
    }
  },
  clearOnlineSession: () => {
    if (get().mode === "online") {
      contextVersion++;
      set({ events: [], eventGroups: {}, groupNames: {}, userId: null, groupName: null, storageAvailable: false, editorOpen: false, busy: false, importingCompetitions: false });
    }
  },
  setSelectedDate: (date) => {
    atNoon(date, get().timeZone);
    set({ selectedDate: date });
  },
  setView: (view) => set({ view }),
  setTimeMode: (mode) => set({ timeMode: mode, timeZone: mode === "utc" ? "UTC" : get().localTimeZone }),
  goToToday: () => set({ selectedDate: todayKey(get().timeZone) }),
  openEditor: (eventId) => {
    if (!get().storageAvailable) {
      toast.error("Calendar storage is unavailable. Changes can't be saved.");
      return;
    }
    set({ editorOpen: true, editingEventId: eventId ?? null, draftSlot: null, draftEvent: null });
  },
  openTemplate: (event) => {
    if (!get().storageAvailable || !isCalendarEvent(event)) {
      toast.error("Couldn't open this template. Check calendar storage and competition details.");
      return;
    }
    set({ editorOpen: true, editingEventId: null, draftSlot: null, draftEvent: event });
  },
  openSlot: (start, end) => {
    if (!get().storageAvailable) {
      toast.error("Calendar storage is unavailable. Changes can't be saved.");
      return;
    }
    if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) {
      toast.error("Invalid operation time slot.");
      return;
    }
    set({ editorOpen: true, editingEventId: null, draftSlot: { start, end }, draftEvent: null });
  },
  closeEditor: () => set({ editorOpen: false, editingEventId: null, draftSlot: null, draftEvent: null }),
  addRecommendedCompetitions: async () => {
    const { storageAvailable, busy, importingCompetitions, mode, activeGroupId, events, eventGroups, selectedDate } = get();
    if (!storageAvailable || busy || importingCompetitions) {
      toast.error("Calendar is busy or unavailable. Competitions were not added.");
      return { added: 0, complete: false };
    }
    const version = contextVersion;
    const keys = new Set(events.filter((event) => mode === "local" || eventGroups[event.id] === activeGroupId)
      .map((event) => event.competition?.catalogKey));
    const missing = recommendedCompetitionEvents(selectedDate).filter((event) => !keys.has(event.competition?.catalogKey));
    set({ importingCompetitions: true });
    let added = 0;
    try {
      if (mode === "local") {
        if (missing.length && !persist([...events, ...missing])) return { added: 0, complete: false };
        if (missing.length) set({ events: [...events, ...missing] });
        return { added: missing.length, complete: true };
      }
      for (const event of missing) {
        if (version !== contextVersion) {
          toast.error("Calendar changed. Competition import stopped; retry in the intended calendar.");
          return { added, complete: false };
        }
        if (!await get().saveEvent(event)) return { added, complete: false };
        added++;
      }
      return { added, complete: true };
    } finally {
      if (version === contextVersion) set({ importingCompetitions: false });
    }
  },
  saveEvent: async (event) => {
    if (!get().storageAvailable || !isCalendarEvent(event)) {
      toast.error("Couldn't save this operation. Check its details and try again.");
      return false;
    }
    const { mode, userId, activeGroupId, eventGroups, busy } = get();
    const version = contextVersion;
    if (mode === "online") {
      const client = getSupabase();
      if (!client || !userId || busy) {
        toast.error("Calendar is busy or unavailable. Please try again.");
        return false;
      }
      set({ busy: true });
      try {
        const exists = Object.prototype.hasOwnProperty.call(eventGroups, event.id);
        const response = exists
          ? await client.from("operations").update({ payload: event, updated_at: new Date().toISOString() }).eq("id", event.id).select("id").maybeSingle()
          : await client.from("operations").insert({ id: event.id, owner_id: userId, group_id: activeGroupId, payload: event }).select("id").single();
        if (response.error) throw response.error;
        if (!response.data) throw new Error("Operation no longer exists or access was removed.");
        if (version !== contextVersion || get().userId !== userId || get().activeGroupId !== activeGroupId || get().mode !== mode) return false;
        const current = get().events;
        set({ events: exists ? current.map((item) => item.id === event.id ? event : item) : [...current, event],
          eventGroups: { ...get().eventGroups, [event.id]: exists ? eventGroups[event.id] : activeGroupId } });
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't save the online operation.");
        return false;
      } finally {
        if (version === contextVersion) set({ busy: false });
      }
    }
    const current = get().events;
    const events = current.some((item) => item.id === event.id)
      ? current.map((item) => item.id === event.id ? event : item)
      : [...current, event];
    if (!persist(events)) return false;
    set({ events });
    return true;
  },
  deleteEvent: async (id) => {
    if (!get().storageAvailable) {
      toast.error("Calendar storage is unavailable.");
      return false;
    }
    const { mode, userId, activeGroupId, busy } = get();
    const version = contextVersion;
    if (mode === "online") {
      const client = getSupabase();
      if (!client || !userId || busy) {
        toast.error("Calendar is busy or unavailable. Please try again.");
        return false;
      }
      set({ busy: true });
      try {
        const { data, error } = await client.from("operations").delete().eq("id", id).select("id").maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Operation no longer exists or access was removed.");
        if (version !== contextVersion || get().userId !== userId || get().activeGroupId !== activeGroupId || get().mode !== mode) return false;
        const eventGroups = { ...get().eventGroups };
        delete eventGroups[id];
        set({ events: get().events.filter((event) => event.id !== id), eventGroups });
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't delete the online operation.");
        return false;
      } finally {
        if (version === contextVersion) set({ busy: false });
      }
    }
    const events = get().events.filter((event) => event.id !== id);
    if (!persist(events)) return false;
    set({ events });
    return true;
  },
}));
