import type { ReactNode } from "react";
import type { LoanStatus } from "@/convex/lib/constants";
import { formatRange, timeAgo } from "@/lib/format";
import { ActivityFeed, LoanStatusPill, type ActivityItem } from "./status";
import { Card } from "./ui";

export type LoanView = {
  status: LoanStatus;
  startDate: string;
  endDate: string;
  createdAt: number;
  overdue: boolean;
  toolName: string;
  toolRemoved: boolean;
  counterpartName: string;
  activity: ActivityItem[];
};

export function LoanCard({ loan, role, actions }: { loan: LoanView; role: "borrower" | "lender"; actions?: ReactNode }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{loan.toolName}</h3>
            <LoanStatusPill status={loan.status} overdue={loan.overdue} />
            {loan.toolRemoved && <span className="text-xs text-muted">(listing removed)</span>}
          </div>
          <p className="mt-1 text-sm text-muted">
            {formatRange(loan.startDate, loan.endDate)} · {role === "borrower" ? "from" : "for"} {loan.counterpartName}
          </p>
          <p className="text-xs text-stone-400">Requested {timeAgo(loan.createdAt)}</p>
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
      <ActivityFeed items={loan.activity} />
    </Card>
  );
}
