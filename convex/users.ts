import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getCurrentUser } from "./lib/auth";
import { fail } from "./lib/errors";

const MAX_NAME = 80;
const MAX_EMAIL = 254;

/**
 * Called by the client after sign-in. Creates the user row from the verified
 * Clerk JWT, or refreshes name/email. Never accepts or changes role/trust:
 * those come only from the identity token (name, email) or admins (trust).
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) fail("UNAUTHENTICATED");

    const email = (identity.email ?? "").trim().toLowerCase().slice(0, MAX_EMAIL);
    const name = (identity.name ?? identity.givenName ?? identity.nickname ?? "Neighbour")
      .trim()
      .slice(0, MAX_NAME) || "Neighbour";

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (existing) {
      if (existing.name !== name || existing.email !== email) {
        await ctx.db.patch(existing._id, { name, email });
      }
      return existing._id;
    }
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email,
      role: "user",
      trustedLender: false,
    });
  },
});

/** The caller's own profile (for the nav and UI hints). Null while signed out or not stored yet. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return { _id: user._id, name: user.name, role: user.role, trustedLender: user.trustedLender };
  },
});

/**
 * Promote or demote a user. Internal only: run from the Convex dashboard or
 *   npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'
 */
export const setRole = internalMutation({
  args: { email: v.string(), role: v.union(v.literal("admin"), v.literal("user")) },
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.trim().toLowerCase()))
      .first();
    if (!user) throw new Error("No user with that email has signed in yet.");
    await ctx.db.patch(user._id, { role });
    return { userId: user._id, role };
  },
});
