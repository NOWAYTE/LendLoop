import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail } from "./errors";

/** A listed (not removed) tool, or NOT_FOUND. */
export async function getActiveTool(
  ctx: QueryCtx | MutationCtx,
  toolId: Id<"tools">,
): Promise<Doc<"tools">> {
  const tool = await ctx.db.get(toolId);
  if (!tool || tool.removedAt !== undefined) fail("NOT_FOUND");
  return tool;
}

export async function approvedLoansFor(ctx: QueryCtx | MutationCtx, toolId: Id<"tools">) {
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_tool", (q) => q.eq("toolId", toolId))
    .collect();
  return loans.filter((l) => l.status === "approved");
}

/** A tool is "on_loan" while it has any approved (not yet returned) loan. */
export async function refreshToolStatus(ctx: MutationCtx, toolId: Id<"tools">): Promise<void> {
  const tool = await ctx.db.get(toolId);
  if (!tool) return;
  const status = (await approvedLoansFor(ctx, toolId)).length > 0 ? "on_loan" : "available";
  if (tool.status !== status) await ctx.db.patch(toolId, { status });
}
