"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { LoanCard } from "@/components/LoanCard";
import { Button, EmptyState, PageHeader, Section, Skeleton } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { withToast } from "@/lib/errors";

export default function IncomingPage() {
  const loans = useQuery(api.loans.incoming);
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const markReturned = useMutation(api.loans.markReturned);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, promise: () => Promise<unknown>, message: string) {
    setBusy(key);
    await withToast(promise(), message);
    setBusy(null);
  }

  if (loans === undefined) {
    return (
      <>
        <PageHeader title="Incoming" subtitle="Requests to borrow your tools." />
        <Skeleton />
      </>
    );
  }

  const pending = loans.filter((l) => l.status === "pending");
  const out = loans.filter((l) => l.status === "approved");
  const history = loans.filter((l) => l.status !== "pending" && l.status !== "approved");
  const id = (loanId: Id<"loans">, action: string) => `${loanId}:${action}`;

  return (
    <>
      <PageHeader title="Incoming" subtitle="Requests to borrow your tools." />
      {loans.length === 0 && (
        <EmptyState title="No requests yet" body="When a neighbour asks to borrow one of your tools, it shows up here." />
      )}

      {pending.length > 0 && (
        <Section title="Waiting for you" count={pending.length}>
          <div className="space-y-3">
            {pending.map((loan) => (
              <LoanCard
                key={loan._id}
                loan={loan}
                role="lender"
                actions={
                  <>
                    <Button
                      busy={busy === id(loan._id, "approve")}
                      onClick={() => act(id(loan._id, "approve"), () => approve({ loanId: loan._id }), "Approved.")}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      busy={busy === id(loan._id, "decline")}
                      onClick={() => act(id(loan._id, "decline"), () => decline({ loanId: loan._id }), "Declined.")}
                    >
                      Decline
                    </Button>
                  </>
                }
              />
            ))}
          </div>
        </Section>
      )}

      {out.length > 0 && (
        <Section title="Out on loan" count={out.length}>
          <div className="space-y-3">
            {out.map((loan) => (
              <LoanCard
                key={loan._id}
                loan={loan}
                role="lender"
                actions={
                  <Button
                    variant="secondary"
                    busy={busy === id(loan._id, "return")}
                    onClick={() =>
                      act(id(loan._id, "return"), () => markReturned({ loanId: loan._id }), "Marked as returned.")
                    }
                  >
                    Mark returned
                  </Button>
                }
              />
            ))}
          </div>
        </Section>
      )}

      {history.length > 0 && (
        <Section title="History" count={history.length}>
          <div className="space-y-3">
            {history.map((loan) => (
              <LoanCard key={loan._id} loan={loan} role="lender" />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
