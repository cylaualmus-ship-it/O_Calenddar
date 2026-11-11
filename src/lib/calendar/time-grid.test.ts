import { describe, expect, it } from "vitest";
import { getDayBounds, getWeekDays } from "./dates";
import { isSpanning, layoutDay, layoutSpanning, moveSpanning, moveTimed, resizeSpanning, resizeTimed, SNAP_MS } from "./time-grid";
import type { AllDayEvent, TimedEvent } from "@/types/calendar";

function timed(id: string, start: string, end: string): TimedEvent {
  return { id, title: id, description: "", location: "", color: "blue", classification: "TLP:CLEAR", status: "pending", allDay: false, start, end };
}
const allDay: AllDayEvent = { id: "all", title: "all", description: "", location: "", color: "green", classification: "TLP:RED", status: "active", allDay: true, startDate: "2026-11-03", endDate: "2026-11-06" };

describe("tactical time grid", () => {
  it("divides overlapping clusters evenly and separates adjacent operations", () => {
    const items = layoutDay([
      timed("a", "2026-11-03T09:00:00Z", "2026-11-03T11:00:00Z"),
      timed("b", "2026-11-03T09:30:00Z", "2026-11-03T10:30:00Z"),
      timed("c", "2026-11-03T10:00:00Z", "2026-11-03T11:30:00Z"),
      timed("d", "2026-11-03T11:30:00Z", "2026-11-03T12:00:00Z"),
    ], "2026-11-03", "UTC");
    expect(items.map((item) => [item.event.id, item.column, item.columns])).toEqual([
      ["a", 0, 3], ["b", 1, 3], ["c", 2, 3], ["d", 0, 1],
    ]);
  });
  it("clips multi-day spans to the visible week with exclusive ends", () => {
    const days = getWeekDays("2026-11-06", "UTC");
    const spans = layoutSpanning([allDay, timed("overnight", "2026-11-02T23:00:00Z", "2026-11-04T00:00:00Z")], days, "UTC");
    expect(spans.map((item) => [item.event.id, item.firstColumn, item.span, item.row])).toEqual([
      ["overnight", 0, 2, 0], ["all", 1, 3, 1],
    ]);
    expect(isSpanning(timed("midnight", "2026-11-02T23:00:00Z", "2026-11-03T00:00:00Z"), "UTC")).toBe(false);
  });
  it("uses the actual number of slots on daylight-saving transition days", () => {
    const spring = getDayBounds("2026-03-08", "America/New_York");
    const fall = getDayBounds("2026-11-01", "America/New_York");
    expect((spring.end - spring.start) / SNAP_MS).toBe(92);
    expect((fall.end - fall.start) / SNAP_MS).toBe(100);
    expect(new Date(fall.start + 4 * SNAP_MS).toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(new Date(fall.start + 8 * SNAP_MS).toISOString()).toBe("2026-11-01T06:00:00.000Z");
  });
  it("snaps a move to 15 minutes while preserving elapsed duration", () => {
    const item = timed("move", "2026-11-03T09:07:00Z", "2026-11-03T10:37:00Z");
    const moved = moveTimed(item, 1, 1, "UTC");
    expect(moved.start).toBe("2026-11-04T09:15:00.000Z");
    expect(Date.parse(moved.end) - Date.parse(moved.start)).toBe(90 * 60_000);
  });
  it("snaps resize and prevents durations under 15 minutes", () => {
    const item = timed("resize", "2026-11-03T09:00:00Z", "2026-11-03T10:07:00Z");
    expect(resizeTimed(item, 1, "UTC").end).toBe("2026-11-03T10:15:00.000Z");
    expect(() => resizeTimed(item, -4, "UTC")).toThrow(/at least 15 minutes/);
  });
  it("moves and resizes all-day operations without changing exclusive-end semantics", () => {
    expect(moveSpanning(allDay, 1, "UTC")).toMatchObject({ startDate: "2026-11-04", endDate: "2026-11-07" });
    expect(resizeSpanning(allDay, 1, "UTC")).toMatchObject({ endDate: "2026-11-07" });
    expect(() => resizeSpanning(allDay, -3, "UTC")).toThrow(/at least one day/);
  });
  it("preserves duration when moving across a daylight-saving transition", () => {
    const item = timed("dst", "2026-03-07T14:00:00Z", "2026-03-07T15:00:00Z");
    const moved = moveTimed(item, 1, 0, "America/New_York");
    expect(moved.start).toBe("2026-03-08T14:00:00.000Z");
    expect(Date.parse(moved.end) - Date.parse(moved.start)).toBe(60 * 60_000);
  });
});
