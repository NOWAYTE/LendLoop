import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { createTool, requestLoan, setup, signIn } from "./helpers.test-utils";

afterEach(() => {
  vi.useRealTimers();
});

async function world() {
  const t = setup();
  const alice = await signIn(t, "Alice");
  const bob = await signIn(t, "Bob");
  const carol = await signIn(t, "Carol");
  const toolId = await createTool(bob);
  return { t, alice, bob, carol, toolId };
}

describe("borrow requests", () => {
  test("users can't borrow their own tool", async () => {
    const { bob, toolId } = await world();
    await expect(requestLoan(bob, toolId)).rejects.toThrow(/FORBIDDEN/);
  });

  test.each([
    ["start in the past", "2026-05-31", "2026-06-02"],
    ["end before start", "2026-06-10", "2026-06-09"],
    ["longer than 30 days", "2026-06-01", "2026-07-01"],
    ["not a real date", "2026-02-30", "2026-03-02"],
    ["wrong format", "06/05/2026", "06/08/2026"],
    ["too far ahead", "2027-07-01", "2027-07-02"],
  ])("rejects dates: %s", async (_label, startDate, endDate) => {
    const { alice, toolId } = await world();
    await expect(requestLoan(alice, toolId, startDate, endDate)).rejects.toThrow(/INVALID_INPUT/);
  });

  test("accepts today and exactly 30 days", async () => {
    const { alice, toolId } = await world();
    await requestLoan(alice, toolId, "2026-06-01", "2026-06-30");
  });

  test("rejects ranges overlapping an approved loan, allows adjacent ones", async () => {
    const { alice, bob, carol, toolId } = await world();
    const loanId = await requestLoan(alice, toolId, "2026-06-05", "2026-06-08");
    await bob.mutation(api.loans.approve, { loanId });

    for (const [start, end] of [
      ["2026-06-08", "2026-06-10"], // shares the last day
      ["2026-06-01", "2026-06-05"], // shares the first day
      ["2026-06-06", "2026-06-07"], // inside
      ["2026-06-01", "2026-06-20"], // around
    ] as const) {
      await expect(requestLoan(carol, toolId, start, end)).rejects.toThrow(/CONFLICT/);
    }
    await requestLoan(carol, toolId, "2026-06-09", "2026-06-12");
  });

  test("approving re-checks overlaps between competing requests", async () => {
    const { alice, bob, carol, toolId } = await world();
    const first = await requestLoan(alice, toolId, "2026-06-05", "2026-06-08");
    const second = await requestLoan(carol, toolId, "2026-06-07", "2026-06-09");
    await bob.mutation(api.loans.approve, { loanId: first });
    await expect(bob.mutation(api.loans.approve, { loanId: second })).rejects.toThrow(/CONFLICT/);
  });

  test("a removed tool can't be requested", async () => {
    const { alice, bob, toolId } = await world();
    await bob.mutation(api.tools.remove, { toolId });
    await expect(requestLoan(alice, toolId)).rejects.toThrow(/NOT_FOUND/);
  });
});

describe("status transitions", () => {
  test("happy path updates the tool's availability", async () => {
    const { alice, bob, toolId } = await world();
    const loanId = await requestLoan(alice, toolId);
    await bob.mutation(api.loans.approve, { loanId });
    expect((await alice.query(api.tools.list, {}))[0]?.status).toBe("on_loan");
    await bob.mutation(api.loans.markReturned, { loanId });
    expect((await alice.query(api.tools.list, {}))[0]?.status).toBe("available");
    expect((await alice.query(api.loans.myRequests, {}))[0]?.status).toBe("returned");
  });

  test("invalid transitions are rejected", async () => {
    const { alice, bob, toolId } = await world();

    const pending = await requestLoan(alice, toolId, "2026-06-02", "2026-06-03");
    // pending -> returned is not allowed
    await expect(bob.mutation(api.loans.markReturned, { loanId: pending })).rejects.toThrow(/CONFLICT/);

    await bob.mutation(api.loans.approve, { loanId: pending });
    // approved -> approved / declined / cancelled are not allowed
    await expect(bob.mutation(api.loans.approve, { loanId: pending })).rejects.toThrow(/CONFLICT/);
    await expect(bob.mutation(api.loans.decline, { loanId: pending })).rejects.toThrow(/CONFLICT/);
    await expect(alice.mutation(api.loans.cancel, { loanId: pending })).rejects.toThrow(/CONFLICT/);

    await bob.mutation(api.loans.markReturned, { loanId: pending });
    // returned is final
    await expect(bob.mutation(api.loans.markReturned, { loanId: pending })).rejects.toThrow(/CONFLICT/);

    const declined = await requestLoan(alice, toolId, "2026-06-10", "2026-06-11");
    await bob.mutation(api.loans.decline, { loanId: declined });
    await expect(bob.mutation(api.loans.approve, { loanId: declined })).rejects.toThrow(/CONFLICT/);
    await expect(alice.mutation(api.loans.cancel, { loanId: declined })).rejects.toThrow(/CONFLICT/);

    const cancelled = await requestLoan(alice, toolId, "2026-06-12", "2026-06-13");
    await alice.mutation(api.loans.cancel, { loanId: cancelled });
    await expect(bob.mutation(api.loans.approve, { loanId: cancelled })).rejects.toThrow(/CONFLICT/);
  });

  test("every status change queues exactly one outbound event", async () => {
    const { t, alice, bob, toolId } = await world();
    const loanId = await requestLoan(alice, toolId);
    await bob.mutation(api.loans.approve, { loanId });
    await bob.mutation(api.loans.markReturned, { loanId });
    const events = await t.run((ctx) => ctx.db.query("outboundEvents").collect());
    expect(events.map((e) => [e.payload.type, e.payload.newStatus, e.payload.recipientName])).toEqual([
      ["created", "pending", "Bob"],
      ["status_changed", "approved", "Alice"],
      ["status_changed", "returned", "Alice"],
    ]);
  });
});

describe("input validation", () => {
  test("tool names and descriptions are length-checked", async () => {
    const { bob } = await world();
    const base = { category: "garden" as const, condition: "good" as const };
    await expect(bob.mutation(api.tools.create, { ...base, name: "   ", description: "" })).rejects.toThrow(
      /INVALID_INPUT/,
    );
    await expect(
      bob.mutation(api.tools.create, { ...base, name: "x".repeat(81), description: "" }),
    ).rejects.toThrow(/INVALID_INPUT/);
    await expect(
      bob.mutation(api.tools.create, { ...base, name: "Rake", description: "x".repeat(501) }),
    ).rejects.toThrow(/INVALID_INPUT/);
    await bob.mutation(api.tools.create, { ...base, name: "x".repeat(80), description: "x".repeat(500) });
  });

  test("an unknown category is rejected by the validator", async () => {
    const { bob } = await world();
    await expect(
      bob.mutation(api.tools.create, {
        name: "Rake",
        category: "weapons" as never,
        condition: "good",
        description: "",
      }),
    ).rejects.toThrow();
  });
});
