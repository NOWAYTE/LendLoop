import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { LIMITS } from "./lib/constants";
import { fail } from "./lib/errors";
import { enqueueLoanEvent } from "./lib/outbox";
import { todayUtc } from "./lib/validation";

// Every function here starts with requireAdmin. Hiding /admin in the UI is only a convenience.

export const loans = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const today = todayUtc();
    const loans = await ctx.db.query("loans").order("desc").take(LIMITS.listPage);
    const names = new Map<string, string>();
    const nameOf = async (id: (typeof loans)[number]["borrowerId"]) => {
      if (!names.has(id)) names.set(id, (await ctx.db.get(id))?.name ?? "Unknown");
      return names.get(id)!;
    };
    return await Promise.all(
      loans.map(async (l) => ({
        _id: l._id,
        status: l.status,
        startDate: l.startDate,
        endDate: l.endDate,
        createdAt: l.createdAt,
        overdue: l.status === "approved" && l.endDate < today,
        toolName: (await ctx.db.get(l.toolId))?.name ?? "Unknown",
        borrowerName: await nameOf(l.borrowerId),
        lenderName: await nameOf(l.lenderId),
      })),
    );
  },
});

export const tools = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const tools = await ctx.db.query("tools").order("desc").take(LIMITS.listPage);
    return await Promise.all(
      tools.map(async (t) => ({
        _id: t._id,
        name: t.name,
        category: t.category,
        status: t.status,
        removedAt: t.removedAt,
        ownerName: (await ctx.db.get(t.ownerId))?.name ?? "Unknown",
      })),
    );
  },
});

export const users = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").order("desc").take(LIMITS.listPage);
    // Admins see emails so they can identify accounts; tokenIdentifiers never leave the server.
    return users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      trustedLender: u.trustedLender,
    }));
  },
});

/** Outbox rows that haven't been delivered, so stuck notifications are visible. */
export const undelivered = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [pending, failed] = await Promise.all([
      ctx.db.query("outboundEvents").withIndex("by_status", (q) => q.eq("status", "pending")).take(50),
      ctx.db.query("outboundEvents").withIndex("by_status", (q) => q.eq("status", "failed")).take(50),
    ]);
    return [...failed, ...pending].map((o) => ({
      _id: o._id,
      status: o.status,
      attempts: o.attempts,
      lastError: o.lastError,
      updatedAt: o.updatedAt,
      toolName: o.payload.toolName,
      newStatus: o.payload.newStatus,
    }));
  },
});

/** Soft-delete any listing. Pending requests on it are declined (and the borrowers told). */
export const removeTool = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const admin = await requireAdmin(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.removedAt !== undefined) fail("NOT_FOUND");
    await ctx.db.patch(toolId, { removedAt: Date.now(), removedBy: admin._id });

    const pending = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", toolId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
    for (const loan of pending) {
      const changes = { status: "declined" as const, updatedAt: Date.now() };
      await ctx.db.patch(loan._id, changes);
      await enqueueLoanEvent(ctx, { ...loan, ...changes }, "status_changed");
    }
    // Approved loans stay: the tool is physically with the borrower and still has to come back.
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) fail("NOT_FOUND");
    await ctx.db.patch(userId, { trustedLender: trusted });
  },
});

/** Re-queue a notification that exhausted its retries (e.g. after n8n was down for hours). */
export const retryOutbound = mutation({
  args: { outboundId: v.id("outboundEvents") },
  handler: async (ctx, { outboundId }) => {
    await requireAdmin(ctx);
    const event = await ctx.db.get(outboundId);
    if (!event) fail("NOT_FOUND");
    if (event.status !== "failed") fail("CONFLICT", "Only failed notifications can be retried.");
    await ctx.db.patch(outboundId, { status: "pending", attempts: 0, lastError: undefined, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.outbound.deliver, { outboundId });
  },
});
