import { describe, expect, it } from "vitest";
import { readStoredEvent } from "./events";

const legacyEvent = {
  id: "original",
  title: "Existing event",
  description: "Preserve me",
  location: "",
  color: "blue",
  allDay: false,
  start: "2026-11-06T09:00:00Z",
  end: "2026-11-06T10:00:00Z",
};

describe("stored operation compatibility", () => {
  it("adds metadata to legacy events without changing their fields", () => {
    expect(readStoredEvent(legacyEvent)).toEqual({
      ...legacyEvent,
      classification: "TLP:CLEAR",
      status: "pending",
    });
  });

  it("rejects invalid metadata rather than silently replacing it", () => {
    expect(readStoredEvent({ ...legacyEvent, classification: "SECRET", status: "active" })).toBeNull();
  });

  it("preserves valid tactical metadata", () => {
    expect(readStoredEvent({ ...legacyEvent, classification: "TLP:RED", status: "active" }))
      .toMatchObject({ classification: "TLP:RED", status: "active" });
  });
});
