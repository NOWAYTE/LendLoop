import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { vAutomationStatus, vAutomationType } from "./schema";
import { isIsoDate } from "./lib/validation";

// Called only from the signed HTTP routes in http.ts; never exposed to browsers.

const overdueKey = (loanId: string, day: string) => `overdue:${loanId}:${day}`;

/** Approved loans whose end date has passed, with only what a reminder email needs. */
export const overdueLoans = internalQuery({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    const approved = await ctx.db
      .query("loans")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();
    const results = [];
    for (const loan of approved) {
      if (loan.endDate >= today) continue;
      const [tool, borrower] = await Promise.all([ctx.db.get(loan.toolId), ctx.db.get(loan.borrowerId)]);
      if (!tool || !borrower || !borrower.email) continue;
      const idempotencyKey = overdueKey(loan._id, today);
      const existing = await ctx.db
        .query("automationEvents")
        .withIndex("by_key", (q) => q.eq("idempotencyKey", idempotencyKey))
        .unique();
      results.push({
        loanId: loan._id,
        idempotencyKey,
        remindedToday: existing?.status === "sent",
        recipientEmail: borrower.email,
        recipientName: borrower.name,
        toolName: tool.name,
        startDate: loan.startDate,
        endDate: loan.endDate,
      });
    }
    return results;
  },
});

export type RecordResult = "created" | "updated" | "duplicate" | "invalid";

/**
 * Idempotent write-back from n8n. The key decides identity:
 *   notify:{eventId}               must match an outbox event for this loan
 *   overdue:{loanId}:{YYYY-MM-DD}  must name this loan
 * A repeated key never inserts a second row. A "failed" row may later be
 * upgraded to "sent" (n8n retried successfully); "sent" is final.
 */
export const recordEvent = internalMutation({
  args: {
    idempotencyKey: v.string(),
    loanId: v.string(),
    type: vAutomationType,
    status: vAutomationStatus,
  },
  handler: async (ctx, args): Promise<RecordResult> => {
    const loanId = ctx.db.normalizeId("loans", args.loanId);
    if (!loanId || !(await ctx.db.get(loanId))) return "invalid";

    if (args.type === "request_notification") {
      const match = /^notify:([0-9a-f-]{36})$/.exec(args.idempotencyKey);
      if (!match) return "invalid";
      const outbound = await ctx.db
        .query("outboundEvents")
        .withIndex("by_eventId", (q) => q.eq("eventId", match[1]!))
        .unique();
      if (!outbound || outbound.loanId !== loanId) return "invalid";
    } else {
      const match = /^overdue:([^:]+):(\d{4}-\d{2}-\d{2})$/.exec(args.idempotencyKey);
      if (!match || match[1] !== loanId || !isIsoDate(match[2]!)) return "invalid";
    }

    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (existing) {
      if (existing.status === "failed" && args.status === "sent") {
        await ctx.db.patch(existing._id, { status: "sent", createdAt: Date.now() });
        return "updated";
      }
      return "duplicate";
    }
    await ctx.db.insert("automationEvents", {
      idempotencyKey: args.idempotencyKey,
      loanId,
      type: args.type,
      status: args.status,
      createdAt: Date.now(),
    });
    return "created";
  },
});
