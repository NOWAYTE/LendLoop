import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { OUTBOUND_BACKOFF_MS, OUTBOUND_MAX_ATTEMPTS } from "./lib/constants";
import { signedHeaders } from "./lib/hmac";

const REQUEST_TIMEOUT_MS = 10_000;

export const get = internalQuery({
  args: { outboundId: v.id("outboundEvents") },
  handler: async (ctx, { outboundId }) => await ctx.db.get(outboundId),
});

/**
 * Sign and POST one outbox event to n8n. Scheduled by the mutation that created
 * the event, and re-scheduled with backoff on failure. Delivery is at-least-once:
 * n8n's write-back is keyed by eventId so a duplicate POST records one event.
 */
export const deliver = internalAction({
  args: { outboundId: v.id("outboundEvents") },
  handler: async (ctx, { outboundId }) => {
    const event = await ctx.runQuery(internal.outbound.get, { outboundId });
    if (!event || event.status !== "pending") return;

    const url = process.env.N8N_WEBHOOK_URL;
    const secret = process.env.N8N_OUTBOUND_SECRET;
    if (!url || !secret) {
      await ctx.runMutation(internal.outbound.recordFailure, { outboundId, error: "n8n is not configured" });
      return;
    }

    const body = JSON.stringify(event.payload);
    let error: string;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await signedHeaders(secret, event.eventId, body)) },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) {
        await ctx.runMutation(internal.outbound.markDelivered, { outboundId });
        return;
      }
      // Status code only: the response body could echo the payload.
      error = `HTTP ${response.status}`;
    } catch (e) {
      // Error name only (TimeoutError, TypeError...): messages can contain the URL.
      error = e instanceof Error ? `Network error (${e.name})` : "Network error";
    }
    await ctx.runMutation(internal.outbound.recordFailure, { outboundId, error });
  },
});

export const markDelivered = internalMutation({
  args: { outboundId: v.id("outboundEvents") },
  handler: async (ctx, { outboundId }) => {
    const event = await ctx.db.get(outboundId);
    if (!event || event.status !== "pending") return;
    await ctx.db.patch(outboundId, {
      status: "delivered",
      attempts: event.attempts + 1,
      lastError: undefined,
      updatedAt: Date.now(),
    });
  },
});

/** Count the attempt, then either schedule the next one (backoff) or give up as failed. */
export const recordFailure = internalMutation({
  args: { outboundId: v.id("outboundEvents"), error: v.string() },
  handler: async (ctx, { outboundId, error }) => {
    const event = await ctx.db.get(outboundId);
    if (!event || event.status !== "pending") return;
    const attempts = event.attempts + 1;
    const giveUp = attempts >= OUTBOUND_MAX_ATTEMPTS;
    await ctx.db.patch(outboundId, {
      status: giveUp ? "failed" : "pending",
      attempts,
      lastError: error.slice(0, 200),
      updatedAt: Date.now(),
    });
    if (giveUp) {
      // Logged without payload or recipient: ids only.
      console.warn(`outbound ${event.eventId} failed after ${attempts} attempts: ${error}`);
      return;
    }
    // attempts is 1..MAX-1 here, so this always lands inside the backoff table.
    const delay = OUTBOUND_BACKOFF_MS[Math.min(attempts, OUTBOUND_BACKOFF_MS.length) - 1]!;
    await ctx.scheduler.runAfter(delay, internal.outbound.deliver, { outboundId });
  },
});
