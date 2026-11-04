import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type ActivityItem = { label: string; at: number; tone: "ok" | "warn" | "muted" };

const NOTIFIED: Record<Doc<"loans">["status"], string> = {
  pending: "Lender notified",
  cancelled: "Lender notified of the cancellation",
  approved: "Borrower notified of approval",
  declined: "Borrower notified of the decline",
  returned: "Borrower notified of the return",
};

/** Automation history for one loan: n8n write-backs plus outbox delivery state. Newest first. */
export async function loanActivity(ctx: QueryCtx, loanId: Id<"loans">): Promise<ActivityItem[]> {
  const [automation, outbound] = await Promise.all([
    ctx.db.query("automationEvents").withIndex("by_loan", (q) => q.eq("loanId", loanId)).collect(),
    ctx.db.query("outboundEvents").withIndex("by_loan", (q) => q.eq("loanId", loanId)).collect(),
  ]);
  const byEventId = new Map(outbound.map((o) => [o.eventId, o]));
  const acknowledged = new Set<string>();
  const items: ActivityItem[] = [];

  for (const event of automation) {
    if (event.type === "overdue_reminder") {
      items.push(
        event.status === "sent"
          ? { label: "Overdue reminder sent", at: event.createdAt, tone: "warn" }
          : { label: "Overdue reminder failed", at: event.createdAt, tone: "warn" },
      );
      continue;
    }
    const eventId = event.idempotencyKey.slice("notify:".length);
    acknowledged.add(eventId);
    const source = byEventId.get(eventId);
    items.push(
      event.status === "sent"
        ? { label: source ? NOTIFIED[source.payload.newStatus] : "Notification sent", at: event.createdAt, tone: "ok" }
        : { label: "Notification email failed", at: event.createdAt, tone: "warn" },
    );
  }

  // Events n8n hasn't confirmed yet show their delivery state.
  for (const o of outbound) {
    if (acknowledged.has(o.eventId)) continue;
    if (o.status === "pending") items.push({ label: "Notification queued", at: o.updatedAt, tone: "muted" });
    if (o.status === "failed") items.push({ label: "Notification couldn't be delivered", at: o.updatedAt, tone: "warn" });
  }

  return items.sort((a, b) => b.at - a.at).slice(0, 6);
}
