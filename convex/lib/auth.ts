import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail } from "./errors";

type Ctx = QueryCtx | MutationCtx;

/** The signed-in user's row, or null. Only for code paths that allow anonymous callers. */
export async function getCurrentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

/** Every protected function calls this (or requireAdmin) before anything else. */
export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) fail("UNAUTHENTICATED");
  return user;
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") fail("FORBIDDEN");
  return user;
}

export function assertToolOwner(user: Doc<"users">, tool: Doc<"tools">): void {
  if (tool.ownerId !== user._id) fail("FORBIDDEN");
}

export function assertLoanParty(
  user: Doc<"users">,
  loan: Doc<"loans">,
  side: "lender" | "borrower",
): void {
  const partyId = side === "lender" ? loan.lenderId : loan.borrowerId;
  if (partyId !== user._id) fail("FORBIDDEN");
}
