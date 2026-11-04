"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { LIMITS } from "@/convex/lib/constants";
import { withToast } from "@/lib/errors";
import { addDaysIso, formatRange, todayIso } from "@/lib/format";
import { Button, Field, inputClass } from "./ui";

type Range = { startDate: string; endDate: string };

/** Client-side hints only; the server re-validates every rule. */
function problem({ startDate, endDate }: Range, booked: Range[], today: string): string | null {
  if (!startDate || !endDate) return null;
  if (startDate < today) return "The start date can't be in the past.";
  if (endDate < startDate) return "The end date must be on or after the start date.";
  if (addDaysIso(startDate, LIMITS.maxLoanDays - 1) < endDate) return `Loans can be at most ${LIMITS.maxLoanDays} days.`;
  if (booked.some((b) => startDate <= b.endDate && b.startDate <= endDate)) return "Those dates clash with an existing loan.";
  return null;
}

export function RequestForm({
  toolId,
  booked,
  onDone,
}: {
  toolId: Id<"tools">;
  booked: Range[];
  onDone: () => void;
}) {
  const request = useMutation(api.loans.request);
  const today = todayIso();
  const [range, setRange] = useState<Range>({ startDate: today, endDate: addDaysIso(today, 2) });
  const [busy, setBusy] = useState(false);
  const issue = problem(range, booked, today);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const ok = await withToast(request({ toolId, ...range }), "Request sent. The owner will be notified.");
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-lg bg-stone-50 p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <input
            type="date"
            required
            className={inputClass}
            min={today}
            value={range.startDate}
            onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))}
          />
        </Field>
        <Field label="Until">
          <input
            type="date"
            required
            className={inputClass}
            min={range.startDate || today}
            max={range.startDate ? addDaysIso(range.startDate, LIMITS.maxLoanDays - 1) : undefined}
            value={range.endDate}
            onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))}
          />
        </Field>
      </div>
      {booked.length > 0 && (
        <p className="text-xs text-muted">Already booked: {booked.map((b) => formatRange(b.startDate, b.endDate)).join(", ")}</p>
      )}
      {issue && <p className="text-sm text-red-700">{issue}</p>}
      <div className="flex gap-2">
        <Button type="submit" busy={busy} disabled={!!issue}>
          Send request
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
