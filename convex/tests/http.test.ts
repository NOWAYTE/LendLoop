import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { signedHeaders } from "../lib/hmac";
import { createTool, requestLoan, setup, signIn, type T } from "./helpers.test-utils";

const INBOUND = "inbound-test-secret";

beforeEach(() => {
  vi.stubEnv("N8N_INBOUND_SECRET", INBOUND);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function signedFetch(t: T, path: string, body: unknown, secret = INBOUND) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const headers = await signedHeaders(secret, crypto.randomUUID(), raw);
  return await t.fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : raw,
  });
}

/** A loan that ended yesterday and is still out. */
async function overdueWorld() {
  const t = setup();
  const alice = await signIn(t, "Alice");
  const bob = await signIn(t, "Bob");
  const toolId = await createTool(bob, "Ladder");
  const loanId = await requestLoan(alice, toolId, "2026-06-02", "2026-06-04");
  await bob.mutation(api.loans.approve, { loanId });
  vi.setSystemTime(new Date("2026-06-06T09:00:00Z"));
  return { t, loanId };
}

describe("GET /n8n/overdue-loans", () => {
  test("rejects unsigned, wrongly signed and stale requests with a bare 401", async () => {
    const { t } = await overdueWorld();
    const unsigned = await t.fetch("/n8n/overdue-loans", { method: "GET" });
    expect(unsigned.status).toBe(401);
    expect(await unsigned.json()).toEqual({ error: "unauthorized" });

    expect((await signedFetch(t, "/n8n/overdue-loans", undefined, "wrong")).status).toBe(401);

    const old = await signedHeaders(INBOUND, "evt", "", Date.now() - 6 * 60_000);
    expect((await t.fetch("/n8n/overdue-loans", { method: "GET", headers: old })).status).toBe(401);
  });

  test("fails closed when the inbound secret isn't configured", async () => {
    const { t } = await overdueWorld();
    vi.stubEnv("N8N_INBOUND_SECRET", "");
    // Whatever key the caller signs with, an unset server secret never verifies.
    expect((await signedFetch(t, "/n8n/overdue-loans", undefined, "anything")).status).toBe(401);
  });

  test("returns overdue loans with minimal fields", async () => {
    const { t, loanId } = await overdueWorld();
    const res = await signedFetch(t, "/n8n/overdue-loans", undefined);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.today).toBe("2026-06-06");
    expect(body.loans).toEqual([
      {
        loanId,
        idempotencyKey: `overdue:${loanId}:2026-06-06`,
        remindedToday: false,
        recipientEmail: "alice@test.invalid",
        recipientName: "Alice",
        toolName: "Ladder",
        startDate: "2026-06-02",
        endDate: "2026-06-04",
      },
    ]);
  });
});

describe("POST /n8n/automation-event", () => {
  test("the same idempotency key twice creates one record", async () => {
    const { t, loanId } = await overdueWorld();
    const event = {
      idempotencyKey: `overdue:${loanId}:2026-06-06`,
      loanId,
      type: "overdue_reminder",
      status: "sent",
    };
    const first = await signedFetch(t, "/n8n/automation-event", event);
    const second = await signedFetch(t, "/n8n/automation-event", event);
    expect(first.status).toBe(200);
    expect((await first.json()).result).toBe("created");
    expect(second.status).toBe(200);
    expect((await second.json()).result).toBe("duplicate");

    const rows = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(rows).toHaveLength(1);

    // And the overdue feed now says not to remind again today.
    const feed = await (await signedFetch(t, "/n8n/overdue-loans", undefined)).json();
    expect(feed.loans[0].remindedToday).toBe(true);
  });

  test("a failed attempt can be upgraded to sent, but never duplicated", async () => {
    const { t, loanId } = await overdueWorld();
    const key = `overdue:${loanId}:2026-06-06`;
    const base = { idempotencyKey: key, loanId, type: "overdue_reminder" };
    await signedFetch(t, "/n8n/automation-event", { ...base, status: "failed" });
    const retry = await signedFetch(t, "/n8n/automation-event", { ...base, status: "sent" });
    expect((await retry.json()).result).toBe("updated");
    const late = await signedFetch(t, "/n8n/automation-event", { ...base, status: "failed" });
    expect((await late.json()).result).toBe("duplicate");
    const rows = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(rows.map((r) => r.status)).toEqual(["sent"]);
  });

  test("notification write-backs must reference a real outbox event for that loan", async () => {
    const { t, loanId } = await overdueWorld();
    const outbound = await t.run((ctx) => ctx.db.query("outboundEvents").first());
    const ok = await signedFetch(t, "/n8n/automation-event", {
      idempotencyKey: `notify:${outbound!.eventId}`,
      loanId,
      type: "request_notification",
      status: "sent",
    });
    expect(ok.status).toBe(200);

    const made_up = await signedFetch(t, "/n8n/automation-event", {
      idempotencyKey: `notify:${crypto.randomUUID()}`,
      loanId,
      type: "request_notification",
      status: "sent",
    });
    expect(made_up.status).toBe(400);
  });

  test("rejects malformed bodies and mismatched keys", async () => {
    const { t, loanId } = await overdueWorld();
    const bad = [
      { idempotencyKey: `overdue:${loanId}:2026-06-06`, loanId, type: "overdue_reminder", status: "maybe" },
      { idempotencyKey: `overdue:${loanId}:2026-06-06`, loanId, type: "something_else", status: "sent" },
      { idempotencyKey: "overdue:someone-else:2026-06-06", loanId, type: "overdue_reminder", status: "sent" },
      { idempotencyKey: `overdue:${loanId}:2026-13-45`, loanId, type: "overdue_reminder", status: "sent" },
      { idempotencyKey: `overdue:${loanId}:2026-06-06`, loanId: "not-an-id", type: "overdue_reminder", status: "sent" },
      "just a string",
    ];
    for (const body of bad) {
      expect((await signedFetch(t, "/n8n/automation-event", body)).status).toBe(400);
    }
    const rows = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(rows).toHaveLength(0);
  });

  test("a tampered body is rejected even with a valid signature for the original", async () => {
    const { t, loanId } = await overdueWorld();
    const raw = JSON.stringify({
      idempotencyKey: `overdue:${loanId}:2026-06-06`,
      loanId,
      type: "overdue_reminder",
      status: "failed",
    });
    const headers = await signedHeaders(INBOUND, "evt-1", raw);
    const res = await t.fetch("/n8n/automation-event", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: raw.replace("failed", "sent"),
    });
    expect(res.status).toBe(401);
  });
});
