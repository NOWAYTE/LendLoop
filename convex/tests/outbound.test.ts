import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { verify } from "../lib/hmac";
import { createTool, requestLoan, setup, signIn, signInAdmin } from "./helpers.test-utils";

const OUTBOUND = "outbound-test-secret";

beforeEach(() => {
  vi.stubEnv("N8N_WEBHOOK_URL", "https://n8n.test.invalid/webhook/lendloop");
  vi.stubEnv("N8N_OUTBOUND_SECRET", OUTBOUND);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function createRequest() {
  const t = setup();
  const alice = await signIn(t, "Alice");
  const bob = await signIn(t, "Bob");
  const toolId = await createTool(bob);
  await requestLoan(alice, toolId);
  return { t, alice, bob };
}

describe("outbox delivery to n8n", () => {
  test("delivers a signed, minimal payload", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => new Response("ok", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { t } = await createRequest();
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://n8n.test.invalid/webhook/lendloop");
    const headers = init.headers as Record<string, string>;
    const body = init.body as string;
    expect(
      await verify({
        secret: OUTBOUND,
        timestamp: headers["X-LendLoop-Timestamp"]!,
        signature: headers["X-LendLoop-Signature"]!,
        rawBody: body,
      }),
    ).toBe(true);

    const payload = JSON.parse(body);
    expect(Object.keys(payload).sort()).toEqual(
      ["endDate", "eventId", "loanId", "newStatus", "recipientEmail", "recipientName", "startDate", "toolName", "type"],
    );
    expect(payload).toMatchObject({ type: "created", newStatus: "pending", recipientName: "Bob", toolName: "Cordless drill" });
    expect(headers["X-LendLoop-Event-Id"]).toBe(payload.eventId);

    const [event] = await t.run((ctx) => ctx.db.query("outboundEvents").collect());
    expect(event).toMatchObject({ status: "delivered", attempts: 1 });
  });

  test("retries with backoff, then marks the event failed after 5 attempts", async () => {
    const fetchMock = vi.fn(async () => new Response("down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t } = await createRequest();
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    const [event] = await t.run((ctx) => ctx.db.query("outboundEvents").collect());
    expect(event).toMatchObject({ status: "failed", attempts: 5, lastError: "HTTP 503" });
  });

  test("recovers if n8n comes back during the retries", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        if (calls < 3) throw new TypeError("fetch failed");
        return new Response("ok", { status: 200 });
      }),
    );
    const { t } = await createRequest();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [event] = await t.run((ctx) => ctx.db.query("outboundEvents").collect());
    expect(event).toMatchObject({ status: "delivered", attempts: 3 });
  });

  test("an admin can re-queue a failed event", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    const { t, alice } = await createRequest();
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const admin = await signInAdmin(t, "Admin");
    const [failed] = await admin.query(api.admin.undelivered, {});
    expect(failed?.status).toBe("failed");
    // Admin view shows no recipient details.
    expect(failed).not.toHaveProperty("recipientEmail");

    await expect(alice.mutation(api.admin.retryOutbound, { outboundId: failed!._id })).rejects.toThrow(/FORBIDDEN/);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
    await admin.mutation(api.admin.retryOutbound, { outboundId: failed!._id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await admin.query(api.admin.undelivered, {})).toHaveLength(0);
  });
});
