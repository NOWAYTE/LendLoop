import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { HEADER_EVENT_ID, HEADER_SIGNATURE, HEADER_TIMESTAMP, verify } from "./lib/hmac";
import { todayUtc } from "./lib/validation";

// Endpoints n8n calls. Every request must carry a fresh HMAC signature made with
// N8N_INBOUND_SECRET; anything else gets a bare 401 with no detail.

const MAX_BODY_BYTES = 8 * 1024;
const EVENT_ID = /^[A-Za-z0-9._:-]{1,128}$/;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const unauthorized = () => json(401, { error: "unauthorized" });
const badRequest = () => json(400, { error: "invalid request" });

/** Reads the raw body and verifies the signature over exactly those bytes. Null means reject. */
async function readSigned(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return null;
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return null;
  if (!EVENT_ID.test(request.headers.get(HEADER_EVENT_ID) ?? "")) return null;
  const ok = await verify({
    secret: process.env.N8N_INBOUND_SECRET,
    timestamp: request.headers.get(HEADER_TIMESTAMP),
    signature: request.headers.get(HEADER_SIGNATURE),
    rawBody,
  });
  if (!ok) {
    console.warn(`rejected unsigned or stale request to ${new URL(request.url).pathname}`);
    return null;
  }
  return rawBody;
}

const http = httpRouter();

http.route({
  path: "/n8n/overdue-loans",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if ((await readSigned(request)) === null) return unauthorized();
    const today = todayUtc();
    const loans = await ctx.runQuery(internal.automation.overdueLoans, { today });
    return json(200, { today, loans });
  }),
});

const AUTOMATION_TYPES = new Set(["request_notification", "overdue_reminder"]);
const AUTOMATION_STATUSES = new Set(["sent", "failed"]);

http.route({
  path: "/n8n/automation-event",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const rawBody = await readSigned(request);
    if (rawBody === null) return unauthorized();

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return badRequest();
    }
    if (typeof body !== "object" || body === null) return badRequest();
    const { idempotencyKey, loanId, type, status } = body as Record<string, unknown>;
    if (
      typeof idempotencyKey !== "string" ||
      idempotencyKey.length > 200 ||
      typeof loanId !== "string" ||
      loanId.length > 64 ||
      typeof type !== "string" ||
      !AUTOMATION_TYPES.has(type) ||
      typeof status !== "string" ||
      !AUTOMATION_STATUSES.has(status)
    ) {
      return badRequest();
    }

    const result = await ctx.runMutation(internal.automation.recordEvent, {
      idempotencyKey,
      loanId,
      type: type as "request_notification" | "overdue_reminder",
      status: status as "sent" | "failed",
    });
    if (result === "invalid") return badRequest();
    return json(200, { ok: true, result });
  }),
});

export default http;
