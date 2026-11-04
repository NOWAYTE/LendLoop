// Shared by Convex functions and the Next.js UI, so labels and limits never drift.

export const CATEGORIES = [
  "power_tools",
  "garden",
  "kitchen",
  "camping",
  "hand_tools",
  "cleaning",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  power_tools: "Power tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  hand_tools: "Hand tools",
  cleaning: "Cleaning",
  other: "Other",
};

export const CONDITIONS = ["new", "good", "fair", "worn"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const LOAN_STATUSES = ["pending", "approved", "declined", "cancelled", "returned"] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

export const LIMITS = {
  toolName: 80,
  toolDescription: 500,
  /** Longest loan, counting both the start and end day. */
  maxLoanDays: 30,
  /** How far ahead a loan may start. Stops "reserve forever" squatting. */
  maxAdvanceDays: 365,
  /** Page size for list queries. Real pagination is noted as a production follow-up. */
  listPage: 200,
} as const;

/** Delays before each retry of an outbound webhook. Attempt 5 failing marks the event failed. */
export const OUTBOUND_BACKOFF_MS = [30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000] as const;
export const OUTBOUND_MAX_ATTEMPTS = 5;

/** Signed requests older (or further in the future) than this are rejected as replays. */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
