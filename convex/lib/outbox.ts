import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Transactional outbox: record a notification for n8n in the same mutation that
 * changed the loan, and schedule delivery in that same transaction. If the
 * mutation rolls back, neither the change nor the event exists; if it commits,
 * the event will be delivered (or retried until marked failed).
 *
 * Recipient: a new or cancelled request goes to the lender; approve / decline /
 * return go to the borrower. Only the minimal fields n8n needs are copied.
 */
export async function enqueueLoanEvent(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  type: "created" | "status_changed",
): Promise<void> {
  const tool = await ctx.db.get(loan.toolId);
  const notifyLender = type === "created" || loan.status === "cancelled";
  const recipient = await ctx.db.get(notifyLender ? loan.lenderId : loan.borrowerId);
  // No email on file (Clerk JWT template without the email claim): nothing to send.
  if (!tool || !recipient || !recipient.email) return;

  const eventId = crypto.randomUUID();
  const now = Date.now();
  const outboundId = await ctx.db.insert("outboundEvents", {
    eventId,
    loanId: loan._id,
    payload: {
      eventId,
      type,
      loanId: loan._id,
      newStatus: loan.status,
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      toolName: tool.name,
      startDate: loan.startDate,
      endDate: loan.endDate,
    },
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.outbound.deliver, { outboundId });
}
