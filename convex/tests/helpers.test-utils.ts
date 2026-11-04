import { convexTest } from "convex-test";
import { vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "./test.setup";

/** Fixed clock so date rules are deterministic: "today" is 2026-06-01 (UTC). */
export const TODAY = "2026-06-01";

export function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  return convexTest(schema, modules);
}

export type T = ReturnType<typeof setup>;

/** A signed-in user with a stored profile. */
export async function signIn(t: T, name: string) {
  const as = t.withIdentity({
    subject: name,
    tokenIdentifier: `https://clerk.test|${name}`,
    name,
    email: `${name.toLowerCase()}@test.invalid`,
  });
  const userId = await as.mutation(api.users.store, {});
  return Object.assign(as, { userId });
}

export async function signInAdmin(t: T, name: string) {
  const as = await signIn(t, name);
  await t.mutation(internal.users.setRole, { email: `${name.toLowerCase()}@test.invalid`, role: "admin" });
  return as;
}

export async function createTool(as: Awaited<ReturnType<typeof signIn>>, name = "Cordless drill") {
  return await as.mutation(api.tools.create, {
    name,
    category: "power_tools",
    condition: "good",
    description: "18V with two batteries.",
  });
}

export async function requestLoan(
  as: Awaited<ReturnType<typeof signIn>>,
  toolId: Id<"tools">,
  startDate = "2026-06-05",
  endDate = "2026-06-08",
) {
  return await as.mutation(api.loans.request, { toolId, startDate, endDate });
}
