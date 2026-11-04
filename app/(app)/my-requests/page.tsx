"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { LoanCard } from "@/components/LoanCard";
import { Button, buttonClass, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { withToast } from "@/lib/errors";

export default function MyRequestsPage() {
  const loans = useQuery(api.loans.myRequests);
  const cancel = useMutation(api.loans.cancel);
  const [busy, setBusy] = useState<Id<"loans"> | null>(null);

  return (
    <>
      <PageHeader title="My requests" subtitle="Things you've asked to borrow." />
      {loans === undefined ? (
        <Skeleton />
      ) : loans.length === 0 ? (
        <EmptyState
          title="No requests yet"
          body="Find something you need and ask to borrow it."
          action={
            <Link href="/tools" className={buttonClass()}>
              Browse tools
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {loans.map((loan) => (
            <LoanCard
              key={loan._id}
              loan={loan}
              role="borrower"
              actions={
                loan.status === "pending" && (
                  <Button
                    variant="secondary"
                    busy={busy === loan._id}
                    onClick={async () => {
                      setBusy(loan._id);
                      await withToast(cancel({ loanId: loan._id }), "Request cancelled.");
                      setBusy(null);
                    }}
                  >
                    Cancel request
                  </Button>
                )
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
