import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { vCategory, vCondition } from "./schema";
import { assertToolOwner, requireUser } from "./lib/auth";
import { LIMITS } from "./lib/constants";
import { fail } from "./lib/errors";
import { approvedLoansFor, getActiveTool } from "./lib/tools";
import { cleanOptionalText, cleanText, todayUtc } from "./lib/validation";

/**
 * The only function callable without signing in. Returns name + category of
 * available tools and nothing else: no ids, owners, descriptions or dates.
 */
export const publicList = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_status", (q) => q.eq("status", "available"))
      .order("desc")
      .take(LIMITS.listPage);
    return tools
      .filter((t) => t.removedAt === undefined)
      .map((t) => ({ name: t.name, category: t.category }));
  },
});

/** Every listed tool for signed-in neighbours, with owner name, trust badge and booked dates. */
export const list = query({
  args: { category: v.optional(vCategory) },
  handler: async (ctx, { category }) => {
    const user = await requireUser(ctx);
    const today = todayUtc();
    const tools = category
      ? await ctx.db
          .query("tools")
          .withIndex("by_category", (q) => q.eq("category", category))
          .order("desc")
          .take(LIMITS.listPage)
      : await ctx.db.query("tools").order("desc").take(LIMITS.listPage);

    const owners = new Map<string, { name: string; trustedLender: boolean } | null>();
    const results = [];
    for (const tool of tools) {
      if (tool.removedAt !== undefined) continue;
      if (!owners.has(tool.ownerId)) {
        const owner = await ctx.db.get(tool.ownerId);
        owners.set(tool.ownerId, owner ? { name: owner.name, trustedLender: owner.trustedLender } : null);
      }
      const owner = owners.get(tool.ownerId);
      const booked = (await approvedLoansFor(ctx, tool._id))
        .filter((l) => l.endDate >= today)
        .map((l) => ({ startDate: l.startDate, endDate: l.endDate }))
        .sort((a, b) => a.startDate.localeCompare(b.startDate));
      results.push({
        _id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        status: tool.status,
        ownerName: owner?.name ?? "A neighbour",
        ownerTrusted: owner?.trustedLender ?? false,
        isOwn: tool.ownerId === user._id,
        booked,
      });
    }
    return results;
  },
});

/** The caller's own listings, with how many requests are waiting on each. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(LIMITS.listPage);
    const results = [];
    for (const tool of tools) {
      if (tool.removedAt !== undefined) continue;
      const loans = await ctx.db
        .query("loans")
        .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
        .collect();
      results.push({
        _id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        status: tool.status,
        pendingCount: loans.filter((l) => l.status === "pending").length,
        activeLoanCount: loans.filter((l) => l.status === "approved").length,
      });
    }
    return results;
  },
});

const toolFields = {
  name: v.string(),
  category: vCategory,
  condition: vCondition,
  description: v.string(),
};

function cleanToolInput(input: { name: string; description: string }) {
  return {
    name: cleanText(input.name, LIMITS.toolName, "Name"),
    description: cleanOptionalText(input.description, LIMITS.toolDescription, "Description"),
  };
}

export const create = mutation({
  args: toolFields,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { name, description } = cleanToolInput(args);
    return await ctx.db.insert("tools", {
      ownerId: user._id,
      name,
      description,
      category: args.category,
      condition: args.condition,
      status: "available",
    });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...toolFields },
  handler: async (ctx, { toolId, ...args }) => {
    const user = await requireUser(ctx);
    const tool = await getActiveTool(ctx, toolId);
    assertToolOwner(user, tool);
    const { name, description } = cleanToolInput(args);
    // ownerId and status are never taken from the client.
    await ctx.db.patch(toolId, { name, description, category: args.category, condition: args.condition });
  },
});

/** Owner removes their listing (soft delete). Blocked while requests or loans are open. */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const user = await requireUser(ctx);
    const tool = await getActiveTool(ctx, toolId);
    assertToolOwner(user, tool);
    const open = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", toolId))
      .filter((q) => q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "approved")))
      .first();
    if (open) fail("CONFLICT", "Resolve its open requests and loans before removing this tool.");
    await ctx.db.patch(toolId, { removedAt: Date.now(), removedBy: user._id });
  },
});
