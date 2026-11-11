import { describe, expect, it } from "vitest";
import { atNoon, dualTime, eventOccursOn, getMonthDays, getWeekDays, localDateTimeToDate, moveSelection } from "./dates";
import type { CalendarEvent } from "@/types/calendar";

describe("calendar date arithmetic", () => {
  it("builds a Monday-first six-week month grid", () => {
    const days = getMonthDays("2026-11-06", "Asia/Hong_Kong");
    expect(days).toHaveLength(42);
    expect(days[0]).toBe("2026-10-26");
    expect(days[41]).toBe("2026-12-06");
  });
  it("keeps local dates across a DST transition", () => {
    expect(getWeekDays("2026-03-08", "America/New_York")).toEqual([
      "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08",
    ]);
    expect(moveSelection("2026-03-08", "day", 1, "America/New_York")).toBe("2026-03-09");
  });
  it("rejects invalid dates and missing DST times", () => {
    expect(() => atNoon("2026-02-30", "UTC")).toThrow();
    expect(() => localDateTimeToDate("2026-03-08T02:30", "America/New_York")).toThrow();
  });
  it("treats event end times as exclusive at midnight", () => {
    const event: CalendarEvent = { id: "1", title: "Test", description: "", location: "", color: "blue", classification: "TLP:CLEAR", status: "pending", allDay: false, start: "2026-11-06T15:00:00Z", end: "2026-11-06T16:00:00Z" };
    expect(eventOccursOn(event, "2026-11-06", "Asia/Hong_Kong")).toBe(true);
    expect(eventOccursOn(event, "2026-11-07", "Asia/Hong_Kong")).toBe(false);
  });
  it("respects exclusive all-day end dates", () => {
    const event: CalendarEvent = { id: "2", title: "Trip", description: "", location: "", color: "green", classification: "TLP:CLEAR", status: "pending", allDay: true, startDate: "2026-11-06", endDate: "2026-11-08" };
    expect(eventOccursOn(event, "2026-11-07", "UTC")).toBe(true);
    expect(eventOccursOn(event, "2026-11-08", "UTC")).toBe(false);
  });
  it("handles dates whose daylight-saving transition skips midnight", () => {
    const event: CalendarEvent = { id: "3", title: "Test", description: "", location: "", color: "blue", classification: "TLP:CLEAR", status: "pending", allDay: false, start: "2018-11-04T03:00:00Z", end: "2018-11-04T04:00:00Z" };
    expect(eventOccursOn(event, "2018-11-04", "America/Sao_Paulo")).toBe(true);
    expect(eventOccursOn(event, "2018-11-03", "America/Sao_Paulo")).toBe(false);
  });
  it("rejects ambiguous local times instead of choosing an occurrence silently", () => {
    expect(() => localDateTimeToDate("2026-11-01T01:30", "America/New_York")).toThrow(/occurs twice/);
    expect(localDateTimeToDate("2026-11-01T01:30", "UTC").toISOString()).toContain("01:30");
  });
  it("shows both dates when local and UTC cross a midnight boundary", () => {
    expect(dualTime("2026-11-06T16:30:00Z", "Asia/Hong_Kong"))
      .toBe("2026-11-07 00:30 L | 2026-11-06 16:30 Z");
  });
});
