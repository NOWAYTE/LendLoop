"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { LoanStatusPill, ToolStatusPill } from "@/components/status";
import { Button, Card, EmptyState, PageHeader, Pill, Section, Skeleton } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { CATEGORY_LABELS } from "@/convex/lib/constants";
import { withToast } from "@/lib/errors";
import { formatRange, timeAgo } from "@/lib/format";

const th = "px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted";
const td = "px-4 py-2.5 text-sm";

export default function AdminPage() {
  const me = useQuery(api.users.me);
  if (me === undefined) return <Skeleton />;
  // UI gate only: every admin query and mutation runs requireAdmin on the server.
  if (me?.role !== "admin") {
    return <EmptyState title="Admins only" body="You don't have access to this page." />;
  }
  return <AdminDashboard />;
}

function AdminDashboard() {
  const loans = useQuery(api.admin.loans);
  const tools = useQuery(api.admin.tools);
  const users = useQuery(api.admin.users);
  const undelivered = useQuery(api.admin.undelivered);
  const removeTool = useMutation(api.admin.removeTool);
  const setTrusted = useMutation(api.admin.setTrustedLender);
  const retry = useMutation(api.admin.retryOutbound);
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="Admin" subtitle="Every loan, listing and neighbour." />

      {undelivered && undelivered.length > 0 && (
        <Section title="Undelivered notifications" count={undelivered.length}>
          <Card className="overflow-x-auto p-0">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Tool</th>
                  <th className={th}>Event</th>
                  <th className={th}>State</th>
                  <th className={th}>Last error</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {undelivered.map((o) => (
                  <tr key={o._id}>
                    <td className={td}>{o.toolName}</td>
                    <td className={td}>{o.newStatus}</td>
                    <td className={td}>
                      <Pill tone={o.status === "failed" ? "red" : "amber"}>
                        {o.status} · {o.attempts} attempt{o.attempts === 1 ? "" : "s"}
                      </Pill>
                    </td>
                    <td className={`${td} text-muted`}>
                      {o.lastError ?? "—"} <span className="text-stone-400">· {timeAgo(o.updatedAt)}</span>
                    </td>
                    <td className={`${td} text-right`}>
                      {o.status === "failed" && (
                        <Button variant="secondary" onClick={() => withToast(retry({ outboundId: o._id }), "Re-queued.")}>
                          Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>
      )}

      <Section title="All loans" count={loans?.length}>
        {loans === undefined ? (
          <Skeleton rows={1} />
        ) : loans.length === 0 ? (
          <EmptyState title="No loans yet" />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Tool</th>
                  <th className={th}>Borrower</th>
                  <th className={th}>Lender</th>
                  <th className={th}>Dates</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {loans.map((l) => (
                  <tr key={l._id}>
                    <td className={td}>{l.toolName}</td>
                    <td className={td}>{l.borrowerName}</td>
                    <td className={td}>{l.lenderName}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatRange(l.startDate, l.endDate)}</td>
                    <td className={td}>
                      <LoanStatusPill status={l.status} overdue={l.overdue} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>

      <Section title="Listings" count={tools?.filter((t) => t.removedAt === undefined).length}>
        {tools === undefined ? (
          <Skeleton rows={1} />
        ) : tools.length === 0 ? (
          <EmptyState title="No listings yet" />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Tool</th>
                  <th className={th}>Owner</th>
                  <th className={th}>Status</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tools.map((t) => (
                  <tr key={t._id} className={t.removedAt !== undefined ? "opacity-50" : undefined}>
                    <td className={td}>
                      {t.name} <span className="text-xs text-muted">· {CATEGORY_LABELS[t.category]}</span>
                    </td>
                    <td className={td}>{t.ownerName}</td>
                    <td className={td}>
                      {t.removedAt !== undefined ? (
                        <Pill tone="stone">Removed {timeAgo(t.removedAt)}</Pill>
                      ) : (
                        <ToolStatusPill status={t.status} />
                      )}
                    </td>
                    <td className={`${td} text-right`}>
                      {t.removedAt === undefined &&
                        (confirming === t._id ? (
                          <Button
                            variant="danger"
                            onClick={async () => {
                              setConfirming(null);
                              await withToast(removeTool({ toolId: t._id }), "Listing removed.");
                            }}
                          >
                            Confirm remove
                          </Button>
                        ) : (
                          <Button variant="ghost" onClick={() => setConfirming(t._id)}>
                            Remove
                          </Button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>

      <Section title="Neighbours" count={users?.length}>
        {users === undefined ? (
          <Skeleton rows={1} />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Name</th>
                  <th className={th}>Email</th>
                  <th className={th}>Role</th>
                  <th className={th}>Trusted Lender</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => (
                  <tr key={u._id}>
                    <td className={td}>{u.name}</td>
                    <td className={`${td} text-muted`}>{u.email || "—"}</td>
                    <td className={td}>{u.role === "admin" ? <Pill tone="blue">Admin</Pill> : "User"}</td>
                    <td className={td}>
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--color-accent)]"
                          checked={u.trustedLender}
                          onChange={(e) =>
                            withToast(
                              setTrusted({ userId: u._id, trusted: e.target.checked }),
                              e.target.checked ? `${u.name} is now a Trusted Lender.` : "Trusted Lender removed.",
                            )
                          }
                        />
                        <span className="text-sm text-muted">{u.trustedLender ? "Yes" : "No"}</span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>
    </>
  );
}
