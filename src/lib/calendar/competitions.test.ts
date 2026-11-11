import { describe, expect, it } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import { competitionCatalog, competitionEvent, isCompetitionDetails, isWebUrl, milestoneEndTime, recommendedCompetitionEvents, recommendedCompetitionIds } from "./competitions";
import { isCalendarEvent, readStoredEvent } from "./events";
import { eventOccursOn } from "./dates";
import { moveTimed } from "./time-grid";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("competition templates", () => {
  it("covers the original platforms and seven recommendations with valid, sourced metadata", () => {
    expect(new Set(competitionCatalog.map((item) => item.details.provider)).size).toBe(12);
    for (const template of competitionCatalog) {
      expect(isCompetitionDetails(template.details)).toBe(true);
      expect(isWebUrl(template.details.website)).toBe(true);
      expect(existsSync(join(process.cwd(), "public", template.details.logoUrl))).toBe(true);
      expect(template.details.eligibility).not.toBe("");
      for (const milestone of template.milestones) {
        expect(isCalendarEvent(competitionEvent(template, "2026-11-09", milestone))).toBe(true);
      }
    }
  });

  it("does not invent official dates for unverified options", () => {
    for (const template of competitionCatalog.filter((item) => !item.milestones.length)) {
      const event = competitionEvent(template, "2026-11-10");
      expect(event).toMatchObject({ allDay: true, startDate: "2026-11-10", endDate: "2026-11-11", competition: { kind: "preparation" } });
      expect(event.description).toContain("not an official event date");
    }
  });

  it("places a confirmed Codeforces round on the correct Hong Kong dates", () => {
    const template = competitionCatalog[0];
    const event = competitionEvent(template, "2026-11-09", template.milestones[0]);
    expect(event.allDay).toBe(false);
    if (event.allDay) throw new Error("Expected timed contest");
    expect(formatInTimeZone(event.start, "Asia/Hong_Kong", "yyyy-MM-dd HH:mm")).toBe("2026-11-12 22:35");
    expect(formatInTimeZone(event.end, "Asia/Hong_Kong", "yyyy-MM-dd HH:mm")).toBe("2026-11-13 00:50");
    expect(eventOccursOn(event, "2026-11-12", "Asia/Hong_Kong")).toBe(true);
    expect(eventOccursOn(event, "2026-11-13", "Asia/Hong_Kong")).toBe(true);
    expect(moveTimed(event, 1, 0, "Asia/Hong_Kong").competition).toEqual(event.competition);
  });

  it("preserves customized metadata through JSON storage and rejects unsafe links", () => {
    const event = competitionEvent(competitionCatalog[0], "2026-11-09");
    const custom = { ...event, competition: { ...competitionCatalog[0].details, provider: "My team", joinInstructions: "Join through our university." } };
    expect(readStoredEvent(JSON.parse(JSON.stringify(custom)))).toEqual(custom);
    for (const url of ["javascript:alert(1)", "data:image/svg+xml,test", "http://example.com", "https://user:password@example.com"]) {
      expect(isWebUrl(url)).toBe(false);
      expect(isCalendarEvent({ ...custom, competition: { ...custom.competition, website: url } })).toBe(false);
      expect(isCalendarEvent({ ...custom, competition: { ...custom.competition, logoUrl: url } })).toBe(false);
    }
    expect(isCompetitionDetails({ ...custom.competition, kind: "unknown" })).toBe(false);
    expect(isCompetitionDetails({ ...custom.competition, logoUrl: "/competition-logos/../unknown.svg" })).toBe(false);
    expect(isCompetitionDetails({ ...custom.competition, provider: " " })).toBe(false);
    expect(isCompetitionDetails({ ...custom.competition, deadlineNotes: "x".repeat(4001) })).toBe(false);
  });

  it("keeps historical events and real submission cutoffs distinct", () => {
    const solana = competitionCatalog.find((item) => item.id === "solana-2026")!;
    expect(solana.schedule).toContain("Ended");
    expect(solana.milestones.every((item) => milestoneEndTime(item) < Date.parse("2026-11-09T15:00:00Z"))).toBe(true);
    const final = solana.milestones.find((item) => item.label.startsWith("Final"))!;
    if (final.allDay) throw new Error("Expected an exact submission cutoff");
    expect(formatInTimeZone(final.start, "Asia/Hong_Kong", "yyyy-MM-dd HH:mm")).toBe("2026-11-09 00:45");
    const deadline = competitionEvent(solana, "2026-11-09", final);
    expect(deadline.competition?.kind).toBe("submission");
  });

  it("builds all twelve milestones for the seven recommendations with joining details", () => {
    const events = recommendedCompetitionEvents("2026-11-10");
    expect(events).toHaveLength(12);
    expect(new Set(events.map((event) => event.competition?.catalogKey)).size).toBe(12);
    expect(new Set(events.map((event) => event.competition?.catalogKey?.split("/")[0])))
      .toEqual(new Set(recommendedCompetitionIds));
    for (const event of events) {
      expect(isCalendarEvent(event)).toBe(true);
      expect(event.title.length).toBeLessThanOrEqual(120);
      expect(event.competition?.joinInstructions).toContain("1.");
      expect(event.competition?.eligibility).not.toBe("");
      expect(event.competition?.deadlineNotes).not.toBe("");
      expect(readStoredEvent(JSON.parse(JSON.stringify(event)))).toEqual(event);
    }
  });

  it("keeps unconfirmed cutoff times as timezone-independent calendar dates", () => {
    const events = recommendedCompetitionEvents("2026-11-10");
    const samsung = events.find((event) => event.competition?.provider === "Samsung Solve for Tomorrow")!;
    expect(samsung).toMatchObject({ allDay: true, startDate: "2026-11-13", endDate: "2026-11-14" });
    for (const zone of ["UTC", "Asia/Hong_Kong", "America/New_York"]) {
      expect(eventOccursOn(samsung, "2026-11-13", zone)).toBe(true);
      expect(eventOccursOn(samsung, "2026-11-14", zone)).toBe(false);
    }
    const vex = events.find((event) => event.competition?.provider === "VEX Robotics" && event.allDay)!;
    expect(eventOccursOn(vex, "2027-02-20", "Asia/Hong_Kong")).toBe(true);
    expect(eventOccursOn(vex, "2027-02-21", "UTC")).toBe(true);
    expect(eventOccursOn(vex, "2027-02-22", "UTC")).toBe(false);
  });

  it("converts international deadlines and contest times to Hong Kong correctly", () => {
    const expected = [
      ["atcoder-abc484", "Contest", "2026-11-14 20:00"],
      ["diamond-challenge-2027", "Submission cutoff", "2027-01-15 06:00"],
      ["technovation-2027", "Team registration cutoff", "2027-03-12 07:59"],
      ["technovation-2027", "Project submission cutoff", "2027-05-06 08:00"],
      ["vex-hk-2027", "Registration opens", "2026-12-16 10:00"],
      ["vex-hk-2027", "Registration cutoff", "2027-01-31 18:00"],
      ["hk-science-fair-2027", "Stage 1 application cutoff", "2026-11-29 23:59"],
    ];
    for (const [id, label, date] of expected) {
      const template = competitionCatalog.find((item) => item.id === id)!;
      const milestone = template.milestones.find((item) => item.label === label)!;
      if (milestone.allDay) throw new Error("Expected timed milestone");
      expect(formatInTimeZone(milestone.start, "Asia/Hong_Kong", "yyyy-MM-dd HH:mm")).toBe(date);
    }
    const samsung = competitionCatalog.find((item) => item.id === "samsung-2026")!;
    expect(milestoneEndTime(samsung.milestones[0])).toBe(Date.parse("2026-11-13T16:00:00Z"));
  });
});
