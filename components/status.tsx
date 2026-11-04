import type { LoanStatus } from "@/convex/lib/constants";
import { timeAgo } from "@/lib/format";
import { Pill, type Tone } from "./ui";

const LOAN: Record<LoanStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  declined: { label: "Declined", tone: "red" },
  cancelled: { label: "Cancelled", tone: "stone" },
  returned: { label: "Returned", tone: "blue" },
};

export function LoanStatusPill({ status, overdue }: { status: LoanStatus; overdue?: boolean }) {
  if (overdue) return <Pill tone="red">Overdue</Pill>;
  return <Pill tone={LOAN[status].tone}>{LOAN[status].label}</Pill>;
}

export function ToolStatusPill({ status }: { status: "available" | "on_loan" }) {
  return status === "available" ? <Pill tone="green">Available</Pill> : <Pill tone="amber">On loan</Pill>;
}

export function TrustedBadge() {
  return (
    <span
      title="Verified by a LendLoop admin"
      className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="size-3" aria-hidden>
        <path d="M10 1.5 3 4.5v5c0 4.2 2.9 7.9 7 9 4.1-1.1 7-4.8 7-9v-5l-7-3Zm-1 12.4L5.6 10.5l1.4-1.4 2 2 4-4 1.4 1.4-5.4 5.4Z" />
      </svg>
      Trusted Lender
    </span>
  );
}

export type ActivityItem = { label: string; at: number; tone: "ok" | "warn" | "muted" };

const DOT = { ok: "bg-green-500", warn: "bg-amber-500", muted: "bg-stone-300" } as const;

/** n8n automation history for a loan ("Lender notified 5 minutes ago"). */
export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 border-t border-line pt-3">
      {items.map((item, i) => (
        <li key={`${item.at}-${i}`} className="flex items-center gap-2 text-xs text-muted">
          <span className={`size-1.5 shrink-0 rounded-full ${DOT[item.tone]}`} />
          <span>
            {item.label} <span className="text-stone-400">· {timeAgo(item.at)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
