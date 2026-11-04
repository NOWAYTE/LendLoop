import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { createTool, requestLoan, setup, signIn, signInAdmin } from "./helpers.test-utils";

afterEach(() => {
  vi.useRealTimers();
});

/** Two neighbours, a tool owned by Bob and a pending request from Alice. */
async function world() {
  const t = setup();
  const alice = await signIn(t, "Alice");
  const bob = await signIn(t, "Bob");
  const toolId = await createTool(bob);
  const loanId = await requestLoan(alice, toolId);
  return { t, alice, bob, toolId, loanId };
}

describe("unauthenticated callers", () => {
  test("can't call any protected query or mutation", async () => {
    const { t, toolId, loanId, alice } = await world();
    const toolArgs = { name: "x", category: "garden" as const, condition: "good" as const, description: "" };
    const calls: [string, () => Promise<unknown>][] = [
      ["tools.list", () => t.query(api.tools.list, {})],
      ["tools.mine", () => t.query(api.tools.mine, {})],
      ["tools.create", () => t.mutation(api.tools.create, toolArgs)],
      ["tools.update", () => t.mutation(api.tools.update, { toolId, ...toolArgs })],
      ["tools.remove", () => t.mutation(api.tools.remove, { toolId })],
      ["loans.request", () => t.mutation(api.loans.request, { toolId, startDate: "2026-06-10", endDate: "2026-06-11" })],
      ["loans.approve", () => t.mutation(api.loans.approve, { loanId })],
      ["loans.decline", () => t.mutation(api.loans.decline, { loanId })],
      ["loans.cancel", () => t.mutation(api.loans.cancel, { loanId })],
      ["loans.markReturned", () => t.mutation(api.loans.markReturned, { loanId })],
      ["loans.myRequests", () => t.query(api.loans.myRequests, {})],
      ["loans.incoming", () => t.query(api.loans.incoming, {})],
      ["admin.loans", () => t.query(api.admin.loans, {})],
      ["admin.tools", () => t.query(api.admin.tools, {})],
      ["admin.users", () => t.query(api.admin.users, {})],
      ["admin.undelivered", () => t.query(api.admin.undelivered, {})],
      ["admin.removeTool", () => t.mutation(api.admin.removeTool, { toolId })],
      ["admin.setTrustedLender", () => t.mutation(api.admin.setTrustedLender, { userId: alice.userId, trusted: true })],
      ["users.store", () => t.mutation(api.users.store, {})],
    ];
    for (const [name, call] of calls) {
      await expect(call(), name).rejects.toThrow(/UNAUTHENTICATED/);
    }
  });

  test("a valid token without a stored profile is still unauthenticated", async () => {
    const { t } = await world();
    const stranger = t.withIdentity({ subject: "x", tokenIdentifier: "https://clerk.test|x" });
    await expect(stranger.query(api.tools.list, {})).rejects.toThrow(/UNAUTHENTICATED/);
  });

  test("users.me returns null rather than throwing", async () => {
    const { t } = await world();
    expect(await t.query(api.users.me, {})).toBeNull();
  });
});

describe("ownership", () => {
  test("user A can't edit or delete user B's tool", async () => {
    const { alice, toolId } = await world();
    await expect(
      alice.mutation(api.tools.update, {
        toolId,
        name: "Mine now",
        category: "garden",
        condition: "worn",
        description: "",
      }),
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(alice.mutation(api.tools.remove, { toolId })).rejects.toThrow(/FORBIDDEN/);
  });

  test("user A can't approve, decline or return loans on user B's tool", async () => {
    const { t, alice, loanId } = await world();
    const carol = await signIn(t, "Carol");
    for (const as of [alice, carol]) {
      await expect(as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/FORBIDDEN/);
      await expect(as.mutation(api.loans.decline, { loanId })).rejects.toThrow(/FORBIDDEN/);
      await expect(as.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/FORBIDDEN/);
    }
  });

  test("only the borrower can cancel a request", async () => {
    const { t, bob, loanId } = await world();
    const carol = await signIn(t, "Carol");
    await expect(bob.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/FORBIDDEN/);
    await expect(carol.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/FORBIDDEN/);
  });

  test("the owner can't delete a tool with a pending or approved loan", async () => {
    const { bob, toolId, loanId } = await world();
    await expect(bob.mutation(api.tools.remove, { toolId })).rejects.toThrow(/CONFLICT/);
    await bob.mutation(api.loans.approve, { loanId });
    await expect(bob.mutation(api.tools.remove, { toolId })).rejects.toThrow(/CONFLICT/);
    await bob.mutation(api.loans.markReturned, { loanId });
    await bob.mutation(api.tools.remove, { toolId });
    expect(await bob.query(api.tools.mine, {})).toHaveLength(0);
  });

  test("each side only sees their own loans", async () => {
    const { t, alice, bob } = await world();
    const carol = await signIn(t, "Carol");
    expect(await alice.query(api.loans.myRequests, {})).toHaveLength(1);
    expect(await bob.query(api.loans.incoming, {})).toHaveLength(1);
    expect(await carol.query(api.loans.myRequests, {})).toHaveLength(0);
    expect(await carol.query(api.loans.incoming, {})).toHaveLength(0);
  });
});

describe("admin functions", () => {
  test("non-admins can't call any of them", async () => {
    const { alice, toolId } = await world();
    await expect(alice.query(api.admin.loans, {})).rejects.toThrow(/FORBIDDEN/);
    await expect(alice.query(api.admin.tools, {})).rejects.toThrow(/FORBIDDEN/);
    await expect(alice.query(api.admin.users, {})).rejects.toThrow(/FORBIDDEN/);
    await expect(alice.query(api.admin.undelivered, {})).rejects.toThrow(/FORBIDDEN/);
    await expect(alice.mutation(api.admin.removeTool, { toolId })).rejects.toThrow(/FORBIDDEN/);
    await expect(
      alice.mutation(api.admin.setTrustedLender, { userId: alice.userId, trusted: true }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  test("an admin can view all loans, remove a listing and set trust", async () => {
    const { t, alice, bob, toolId } = await world();
    const admin = await signInAdmin(t, "Admin");

    expect(await admin.query(api.admin.loans, {})).toHaveLength(1);

    await admin.mutation(api.admin.setTrustedLender, { userId: bob.userId, trusted: true });
    const listed = await alice.query(api.tools.list, {});
    expect(listed[0]?.ownerTrusted).toBe(true);

    await admin.mutation(api.admin.removeTool, { toolId });
    expect(await alice.query(api.tools.list, {})).toHaveLength(0);
    // Soft delete: still in the admin view, and the pending request was declined.
    const tools = await admin.query(api.admin.tools, {});
    expect(tools[0]?.removedAt).toBeTypeOf("number");
    const [request] = await alice.query(api.loans.myRequests, {});
    expect(request?.status).toBe("declined");
  });

  test("users.store never grants or keeps a role the client asks for", async () => {
    const { t, alice } = await world();
    // Extra args are rejected by the validator outright.
    await expect(
      alice.mutation(api.users.store, { role: "admin" } as never),
    ).rejects.toThrow();
    await alice.mutation(api.users.store, {});
    expect((await alice.query(api.users.me, {}))?.role).toBe("user");

    // Re-storing after promotion keeps the admin role (store doesn't touch it).
    const admin = await signInAdmin(t, "Dana");
    await admin.mutation(api.users.store, {});
    expect((await admin.query(api.users.me, {}))?.role).toBe("admin");
  });
});
