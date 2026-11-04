import { afterEach, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { createTool, requestLoan, setup, signIn } from "./helpers.test-utils";

afterEach(() => {
  vi.useRealTimers();
});

test("the public tools query returns only name and category of available tools", async () => {
  const t = setup();
  const bob = await signIn(t, "Bob");
  const alice = await signIn(t, "Alice");
  await createTool(bob, "Hedge trimmer");
  const lent = await createTool(bob, "Pressure washer");
  const removed = await createTool(bob, "Old saw");
  await bob.mutation(api.tools.remove, { toolId: removed });
  const loanId = await requestLoan(alice, lent);
  await bob.mutation(api.loans.approve, { loanId });

  // Anonymous caller: no identity at all.
  const tools = await t.query(api.tools.publicList, {});
  expect(tools).toEqual([{ name: "Hedge trimmer", category: "power_tools" }]);
  for (const tool of tools) expect(Object.keys(tool).sort()).toEqual(["category", "name"]);
});
