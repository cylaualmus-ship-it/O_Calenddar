import { describe, expect, it } from "vitest";
import { isValidUsername, normalizeUsername } from "./username";

describe("usernames", () => {
  it("normalizes usernames consistently", () => {
    expect(normalizeUsername("  Team_42  ")).toBe("team_42");
    expect(isValidUsername("  Team_42  ")).toBe(true);
  });

  it("accepts only 3-24 letters, numbers, and underscores", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("a".repeat(24))).toBe(true);
    expect(isValidUsername("a".repeat(25))).toBe(false);
    expect(isValidUsername("team-name")).toBe(false);
    expect(isValidUsername("team name")).toBe(false);
    expect(isValidUsername("team_12")).toBe(true);
  });
});
