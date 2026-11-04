// Pure input checks. Convex `v` validators guarantee types; these enforce content.

import { LIMITS, type LoanStatus } from "./constants";
import { fail } from "./errors";

// Control characters other than tab/newline have no place in user text.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** Trim, then require 1..max characters with no control characters. */
export function cleanText(value: string, max: number, field: string): string {
  const text = value.trim();
  if (text.length === 0) fail("INVALID_INPUT", `${field} is required.`);
  if (text.length > max) fail("INVALID_INPUT", `${field} must be at most ${max} characters.`);
  if (CONTROL_CHARS.test(text)) fail("INVALID_INPUT", `${field} contains invalid characters.`);
  return text;
}

/** Like cleanText but an empty value is allowed. */
export function cleanOptionalText(value: string, max: number, field: string): string {
  return value.trim().length === 0 ? "" : cleanText(value, max, field);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** True only for real calendar dates in YYYY-MM-DD form (rejects 2026-02-30). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Today's date in UTC. Dates are calendar days; see README for the time-zone trade-off. */
export function todayUtc(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). Both must be valid ISO dates. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** Validates a requested loan window against today. Throws INVALID_INPUT. */
export function assertLoanDates(startDate: string, endDate: string, today: string): void {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) fail("INVALID_INPUT", "Dates must be valid.");
  if (startDate < today) fail("INVALID_INPUT", "The start date can't be in the past.");
  if (endDate < startDate) fail("INVALID_INPUT", "The end date must be on or after the start date.");
  if (daysBetween(startDate, endDate) + 1 > LIMITS.maxLoanDays) {
    fail("INVALID_INPUT", `Loans can be at most ${LIMITS.maxLoanDays} days.`);
  }
  if (daysBetween(today, startDate) > LIMITS.maxAdvanceDays) {
    fail("INVALID_INPUT", "That start date is too far ahead.");
  }
}

/** Inclusive date ranges overlap when each starts on or before the other ends. */
export function rangesOverlap(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

const TRANSITIONS: Record<LoanStatus, readonly LoanStatus[]> = {
  pending: ["approved", "declined", "cancelled"],
  approved: ["returned"],
  declined: [],
  cancelled: [],
  returned: [],
};

export function canTransition(from: LoanStatus, to: LoanStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: LoanStatus, to: LoanStatus): void {
  if (!canTransition(from, to)) fail("CONFLICT", "This request can no longer be changed that way.");
}
