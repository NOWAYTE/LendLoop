import { defineSchema, defineTable } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Category, Condition, LoanStatus } from "./lib/constants";

export const vCategory = v.union(
  v.literal("power_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("hand_tools"),
  v.literal("cleaning"),
  v.literal("other"),
);
export const vCondition = v.union(v.literal("new"), v.literal("good"), v.literal("fair"), v.literal("worn"));
export const vLoanStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);

// Compile-time guard: the validators and lib/constants.ts must list the same values.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _validatorsMatchConstants: [
  Same<Infer<typeof vCategory>, Category>,
  Same<Infer<typeof vCondition>, Condition>,
  Same<Infer<typeof vLoanStatus>, LoanStatus>,
] = [true, true, true];
void _validatorsMatchConstants;
export const vAutomationType = v.union(v.literal("request_notification"), v.literal("overdue_reminder"));
export const vAutomationStatus = v.union(v.literal("sent"), v.literal("failed"));

/** Exactly what n8n receives. Nothing else about a user or tool leaves Convex. */
export const vOutboundPayload = v.object({
  eventId: v.string(),
  type: v.union(v.literal("created"), v.literal("status_changed")),
  loanId: v.id("loans"),
  newStatus: vLoanStatus,
  recipientEmail: v.string(),
  recipientName: v.string(),
  toolName: v.string(),
  startDate: v.string(),
  endDate: v.string(),
});

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    // Only internal.users.setRole writes this; no public mutation accepts it.
    role: v.union(v.literal("admin"), v.literal("user")),
    trustedLender: v.boolean(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: vCategory,
    condition: vCondition,
    description: v.string(),
    // "on_loan" while at least one approved loan exists; recomputed on approve / return.
    status: v.union(v.literal("available"), v.literal("on_loan")),
    // Soft delete: rows stay for loan history and the audit trail.
    removedAt: v.optional(v.number()),
    removedBy: v.optional(v.id("users")),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"])
    .index("by_status", ["status"]),

  loans: defineTable({
    toolId: v.id("tools"),
    borrowerId: v.id("users"),
    lenderId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    status: vLoanStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
    returnedAt: v.optional(v.number()),
  })
    .index("by_tool", ["toolId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    .index("by_status", ["status"]),

  automationEvents: defineTable({
    idempotencyKey: v.string(),
    loanId: v.id("loans"),
    type: vAutomationType,
    status: vAutomationStatus,
    createdAt: v.number(),
  })
    .index("by_key", ["idempotencyKey"])
    .index("by_loan", ["loanId"]),

  outboundEvents: defineTable({
    eventId: v.string(),
    loanId: v.id("loans"),
    payload: vOutboundPayload,
    status: v.union(v.literal("pending"), v.literal("delivered"), v.literal("failed")),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_loan", ["loanId"])
    .index("by_status", ["status"]),
});
