import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "../types/calendar";

const backend = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/client", () => ({ getSupabase: () => backend.client }));

import { useCalendarStore } from "./calendar-store";
import { competitionCatalog, competitionEvent } from "@/lib/calendar/competitions";

const operation: CalendarEvent = {
  id: "c287c521-b671-4ea7-923d-e996c68b6384", title: "Finals",
  description: "", location: "", color: "green", classification: "TLP:CLEAR", status: "pending",
  allDay: false, start: "2026-11-06T10:00:00Z", end: "2026-11-06T11:00:00Z",
};

interface Row { id: string; group_id: string | null; owner_id: string; payload: CalendarEvent }

describe("online and browser calendar isolation", () => {
  let rows: Row[];
  let localData: string | null;
  let currentUser: string;

  beforeEach(() => {
    rows = [];
    localData = null;
    currentUser = "owner";
    vi.stubGlobal("localStorage", {
      getItem: () => localData,
      setItem: (_key: string, value: string) => { localData = value; },
    });
    const accessible = () => rows.filter((row) => row.group_id === "group-1" || (row.group_id === null && row.owner_id === currentUser));
    backend.client = {
      auth: { getUser: async () => ({ data: { user: { id: currentUser } }, error: null }) },
      from: (table: string) => {
        if (table === "competition_groups") return { select: async () => ({ data: [{ id: "group-1", name: "Team" }], error: null }) };
        return {
          select: () => Object.assign(Promise.resolve({ data: accessible(), error: null }), {
            eq: (_column: string, value: string) => Promise.resolve({ data: accessible().filter((row) => row.group_id === value), error: null }),
          }),
          insert: (row: Row) => ({ select: () => ({ single: async () => { rows.push(row); return { data: { id: row.id }, error: null }; } }) }),
          update: ({ payload }: { payload: CalendarEvent }) => ({ eq: (_column: string, id: string) => ({ select: () => ({ maybeSingle: async () => {
            const row = accessible().find((item) => item.id === id);
            if (row) row.payload = payload;
            return { data: row ? { id } : null, error: null };
          } }) }) }),
          delete: () => ({ eq: (_column: string, id: string) => ({ select: () => ({ maybeSingle: async () => {
            const row = accessible().find((item) => item.id === id);
            if (row) rows = rows.filter((item) => item.id !== id);
            return { data: row ? { id } : null, error: null };
          } }) }) }),
        };
      },
    };
    useCalendarStore.setState({ initialized: false, storageAvailable: false, events: [], mode: "local", busy: false, importingCompetitions: false });
  });

  it("shows a group operation in every member's private calendar and keeps changes in one record", async () => {
    await useCalendarStore.getState().initializeOnline("UTC", false, "group-1");
    expect(await useCalendarStore.getState().saveEvent(operation)).toBe(true);
    expect(rows[0].group_id).toBe("group-1");

    currentUser = "member";
    await useCalendarStore.getState().initializeOnline("UTC", false, null);
    expect(useCalendarStore.getState().events).toEqual([operation]);
    expect(await useCalendarStore.getState().saveEvent({ ...operation, title: "Updated finals" })).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].group_id).toBe("group-1");

    currentUser = "owner";
    await useCalendarStore.getState().initializeOnline("UTC", false, "group-1");
    expect(useCalendarStore.getState().events[0].title).toBe("Updated finals");
    expect(await useCalendarStore.getState().deleteEvent(operation.id)).toBe(true);
    currentUser = "member";
    await useCalendarStore.getState().initializeOnline("UTC", false, null);
    expect(useCalendarStore.getState().events).toEqual([]);
  });

  it("keeps private and browser-only operations separate from group operations", async () => {
    useCalendarStore.getState().initialize("UTC", false);
    const before = localData;
    await useCalendarStore.getState().initializeOnline("UTC", false, null);
    expect(await useCalendarStore.getState().saveEvent(operation)).toBe(true);
    expect(rows[0].group_id).toBeNull();
    await useCalendarStore.getState().initializeOnline("UTC", false, "group-1");
    expect(useCalendarStore.getState().events).toEqual([]);
    currentUser = "member";
    await useCalendarStore.getState().initializeOnline("UTC", false, null);
    expect(useCalendarStore.getState().events).toEqual([]);
    useCalendarStore.getState().initialize("UTC", false);
    expect(localData).toBe(before);
    expect(useCalendarStore.getState().events.length).toBeGreaterThan(0);
  });

  it("does not restore account data when sign-out interrupts loading", async () => {
    let resolveUser: (value: { data: { user: { id: string } }; error: null }) => void = () => {};
    backend.client = { auth: { getUser: () => new Promise((resolve) => { resolveUser = resolve; }) } };
    const loading = useCalendarStore.getState().initializeOnline("UTC", false, null);
    useCalendarStore.getState().clearOnlineSession();
    resolveUser({ data: { user: { id: "owner" } }, error: null });
    await loading;
    expect(useCalendarStore.getState().userId).toBeNull();
    expect(useCalendarStore.getState().events).toEqual([]);
    expect(useCalendarStore.getState().storageAvailable).toBe(false);
  });

  it("does not report a rejected online write as saved", async () => {
    await useCalendarStore.getState().initializeOnline("UTC", false, null);
    backend.client = { from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: new Error("Permission denied") }) }) }),
    }) };
    expect(await useCalendarStore.getState().saveEvent(operation)).toBe(false);
    expect(useCalendarStore.getState().events).toEqual([]);
  });

  it("previews templates without saving and persists competition details locally", async () => {
    useCalendarStore.getState().initialize("Asia/Hong_Kong", false);
    const before = localData;
    const event = competitionEvent(competitionCatalog[0], "2026-11-12", competitionCatalog[0].milestones[0]);
    useCalendarStore.getState().openTemplate(event);
    expect(useCalendarStore.getState().draftEvent).toEqual(event);
    expect(localData).toBe(before);
    expect(await useCalendarStore.getState().saveEvent(event)).toBe(true);
    useCalendarStore.getState().closeEditor();
    useCalendarStore.setState({ initialized: false });
    useCalendarStore.getState().initialize("Asia/Hong_Kong", false);
    expect(useCalendarStore.getState().events.find((item) => item.id === event.id)).toEqual(event);
    useCalendarStore.getState().openEditor();
    expect(useCalendarStore.getState().draftEvent).toBeNull();
  });

  it("round-trips competition details through shared online operations", async () => {
    await useCalendarStore.getState().initializeOnline("Asia/Hong_Kong", false, "group-1");
    const event = competitionEvent(competitionCatalog[0], "2026-11-12");
    expect(await useCalendarStore.getState().saveEvent(event)).toBe(true);
    currentUser = "member";
    await useCalendarStore.getState().initializeOnline("Asia/Hong_Kong", false, null);
    expect(useCalendarStore.getState().events[0]).toEqual(event);
    expect(rows[0].group_id).toBe("group-1");
  });

  it("imports all seven recommendations once and preserves edits through retries and reloads", async () => {
    useCalendarStore.getState().initialize("Asia/Hong_Kong", false);
    const originals = [...useCalendarStore.getState().events];
    expect(await useCalendarStore.getState().addRecommendedCompetitions()).toEqual({ added: 12, complete: true });
    const event = useCalendarStore.getState().events.find((item) => item.competition?.catalogKey)!;
    const edited = { ...event, title: "My customized application plan" };
    expect(await useCalendarStore.getState().saveEvent(edited)).toBe(true);
    expect(await useCalendarStore.getState().addRecommendedCompetitions()).toEqual({ added: 0, complete: true });
    useCalendarStore.setState({ initialized: false });
    useCalendarStore.getState().initialize("Asia/Hong_Kong", false);
    expect(useCalendarStore.getState().events).toHaveLength(originals.length + 12);
    expect(useCalendarStore.getState().events).toEqual(expect.arrayContaining(originals));
    expect(useCalendarStore.getState().events.find((item) => item.id === event.id)).toEqual(edited);
  });

  it("leaves local data unchanged when importing cannot be persisted", async () => {
    useCalendarStore.getState().initialize("UTC", false);
    const before = localData;
    const originalEvents = [...useCalendarStore.getState().events];
    vi.stubGlobal("localStorage", { setItem: () => { throw new Error("Storage is full"); } });
    expect(await useCalendarStore.getState().addRecommendedCompetitions()).toEqual({ added: 0, complete: false });
    expect(localData).toBe(before);
    expect(useCalendarStore.getState().events).toEqual(originalEvents);
    expect(useCalendarStore.getState().importingCompetitions).toBe(false);
  });

  it("imports into the selected group or private scope without confusing shared entries with private ones", async () => {
    await useCalendarStore.getState().initializeOnline("UTC", false, "group-1");
    expect(await useCalendarStore.getState().addRecommendedCompetitions()).toEqual({ added: 12, complete: true });
    expect(rows.every((row) => row.group_id === "group-1")).toBe(true);
    expect(await useCalendarStore.getState().addRecommendedCompetitions()).toEqual({ added: 0, complete: true });
    await useCalendarStore.getState().initializeOnline("UTC", false, null);
    expect(await useCalendarStore.getState().addRecommendedCompetitions()).toEqual({ added: 12, complete: true });
    expect(rows.filter((row) => row.group_id === null)).toHaveLength(12);
    expect(rows).toHaveLength(24);
    currentUser = "member";
    await useCalendarStore.getState().initializeOnline("UTC", false, "group-1");
    expect(useCalendarStore.getState().events).toHaveLength(12);
  });

  it("reports partial online imports and retries only missing entries", async () => {
    await useCalendarStore.getState().initializeOnline("UTC", false, "group-1");
    const client = backend.client as { from: (table: string) => unknown };
    const originalFrom = client.from;
    let attempts = 0;
    client.from = (table) => {
      const query = originalFrom(table) as { insert: (row: Row) => unknown };
      return { ...query, insert: (row: Row) => {
        attempts++;
        if (attempts === 3) return { select: () => ({ single: async () => ({ data: null, error: new Error("Import rejected") }) }) };
        return query.insert(row);
      } };
    };
    expect(await useCalendarStore.getState().addRecommendedCompetitions()).toEqual({ added: 2, complete: false });
    expect(rows).toHaveLength(2);
    expect(useCalendarStore.getState().importingCompetitions).toBe(false);
    expect(await useCalendarStore.getState().addRecommendedCompetitions()).toEqual({ added: 10, complete: true });
    expect(new Set(rows.map((row) => row.payload.competition?.catalogKey)).size).toBe(12);
  });
});
