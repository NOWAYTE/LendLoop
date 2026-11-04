import { describe, expect, test } from "vitest";
import { canTransition, daysBetween, isIsoDate, rangesOverlap, todayUtc } from "../lib/validation";

describe("validation helpers", () => {
  test("isIsoDate accepts only real calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-2-1")).toBe(false);
    expect(isIsoDate("2026-02-01T00:00:00Z")).toBe(false);
  });

  test("daysBetween and todayUtc", () => {
    expect(daysBetween("2026-06-01", "2026-06-30")).toBe(29);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(todayUtc(Date.parse("2026-06-01T23:59:59Z"))).toBe("2026-06-01");
  });

  test("rangesOverlap is inclusive", () => {
    const a = { startDate: "2026-06-05", endDate: "2026-06-08" };
    expect(rangesOverlap(a, { startDate: "2026-06-08", endDate: "2026-06-09" })).toBe(true);
    expect(rangesOverlap(a, { startDate: "2026-06-09", endDate: "2026-06-10" })).toBe(false);
    expect(rangesOverlap(a, { startDate: "2026-06-01", endDate: "2026-06-04" })).toBe(false);
  });

  test("the transition table", () => {
    expect(canTransition("pending", "approved")).toBe(true);
    expect(canTransition("pending", "declined")).toBe(true);
    expect(canTransition("pending", "cancelled")).toBe(true);
    expect(canTransition("approved", "returned")).toBe(true);
    expect(canTransition("pending", "returned")).toBe(false);
    expect(canTransition("approved", "cancelled")).toBe(false);
    expect(canTransition("returned", "approved")).toBe(false);
    expect(canTransition("declined", "pending")).toBe(false);
  });
});
