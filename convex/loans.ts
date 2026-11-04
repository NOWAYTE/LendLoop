import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { loanActivity } from "./lib/activity";
import { assertLoanParty, requireUser } from "./lib/auth";
import { LIMITS, type LoanStatus } from "./lib/constants";
import { fail } from "./lib/errors";
import { enqueueLoanEvent } from "./lib/outbox";
import { approvedLoansFor, getActiveTool, refreshToolStatus } from "./lib/tools";
import { assertLoanDates, assertTransition, rangesOverlap, todayUtc } from "./lib/validation";

async function getLoan(ctx: QueryCtx | MutationCtx, loanId: Id<"loans">): Promise<Doc<"loans">> {
  const loan = await ctx.db.get(loanId);
  if (!loan) fail("NOT_FOUND");
  return loan;
}

/** The single place a loan changes status: checks the transition, saves, and queues the notification. */
async function transition(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  to: LoanStatus,
  extra: Partial<Pick<Doc<"loans">, "returnedAt">> = {},
): Promise<void> {
  assertTransition(loan.status, to);
  const changes = { status: to, updatedAt: Date.now(), ...extra };
  await ctx.db.patch(loan._id, changes);
  await enqueueLoanEvent(ctx, { ...loan, ...changes }, "status_changed");
}

export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const user = await requireUser(ctx);
    const tool = await getActiveTool(ctx, toolId);
    if (tool.ownerId === user._id) fail("FORBIDDEN", "You can't borrow your own tool.");
    assertLoanDates(startDate, endDate, todayUtc());

    const range = { startDate, endDate };
    const existing = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", toolId))
      .collect();
    if (existing.some((l) => l.status === "approved" && rangesOverlap(l, range))) {
      fail("CONFLICT", "Those dates clash with an existing loan.");
    }
    if (existing.some((l) => l.status === "pending" && l.borrowerId === user._id && rangesOverlap(l, range))) {
      fail("CONFLICT", "You already have a request for those dates.");
    }

    const now = Date.now();
    const loanId = await ctx.db.insert("loans", {
      toolId,
      borrowerId: user._id,
      lenderId: tool.ownerId,
      startDate,
      endDate,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    const loan = await ctx.db.get(loanId);
    if (loan) await enqueueLoanEvent(ctx, loan, "created");
    return loanId;
  },
});

export const approve = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await getLoan(ctx, loanId);
    assertLoanParty(user, loan, "lender");
    assertTransition(loan.status, "approved");
    await getActiveTool(ctx, loan.toolId);
    if (loan.endDate < todayUtc()) fail("CONFLICT", "This request's dates have already passed.");
    // Re-check at approval time: another request for these dates may have been approved since.
    const clash = (await approvedLoansFor(ctx, loan.toolId)).some((l) => rangesOverlap(l, loan));
    if (clash) fail("CONFLICT", "Those dates clash with a loan you've already approved.");

    await transition(ctx, loan, "approved");
    await refreshToolStatus(ctx, loan.toolId);
  },
});

export const decline = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await getLoan(ctx, loanId);
    assertLoanParty(user, loan, "lender");
    await transition(ctx, loan, "declined");
  },
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await getLoan(ctx, loanId);
    assertLoanParty(user, loan, "borrower");
    await transition(ctx, loan, "cancelled");
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await getLoan(ctx, loanId);
    assertLoanParty(user, loan, "lender");
    await transition(ctx, loan, "returned", { returnedAt: Date.now() });
    await refreshToolStatus(ctx, loan.toolId);
  },
});

async function describeLoan(ctx: QueryCtx, loan: Doc<"loans">, counterpartId: Id<"users">, today: string) {
  const [tool, counterpart, activity] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(counterpartId),
    loanActivity(ctx, loan._id),
  ]);
  return {
    _id: loan._id,
    status: loan.status,
    startDate: loan.startDate,
    endDate: loan.endDate,
    createdAt: loan.createdAt,
    returnedAt: loan.returnedAt,
    overdue: loan.status === "approved" && loan.endDate < today,
    toolName: tool?.name ?? "Removed tool",
    toolRemoved: tool?.removedAt !== undefined,
    counterpartName: counterpart?.name ?? "A neighbour",
    activity,
  };
}

/** Requests the caller has made as a borrower. */
export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const today = todayUtc();
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .order("desc")
      .take(LIMITS.listPage);
    return await Promise.all(loans.map((l) => describeLoan(ctx, l, l.lenderId, today)));
  },
});

/** Requests and loans on the caller's own tools. */
export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const today = todayUtc();
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", user._id))
      .order("desc")
      .take(LIMITS.listPage);
    return await Promise.all(loans.map((l) => describeLoan(ctx, l, l.borrowerId, today)));
  },
});
