"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { RequestForm } from "@/components/RequestForm";
import { ToolStatusPill, TrustedBadge } from "@/components/status";
import { Button, buttonClass, Card, cx, EmptyState, PageHeader, Pill, Skeleton } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/convex/lib/constants";
import { formatRange } from "@/lib/format";

export default function ToolsPage() {
  const [category, setCategory] = useState<Category | undefined>();
  const [requesting, setRequesting] = useState<Id<"tools"> | null>(null);
  const tools = useQuery(api.tools.list, { category });

  return (
    <>
      <PageHeader title="Browse tools" subtitle="Everything your neighbours are happy to lend." />

      <div className="mb-6 flex flex-wrap gap-2">
        {[undefined, ...CATEGORIES].map((c) => (
          <button
            key={c ?? "all"}
            type="button"
            onClick={() => setCategory(c)}
            className={cx(
              "rounded-full px-3 py-1 text-sm ring-1",
              category === c ? "bg-ink text-white ring-ink" : "bg-white text-muted ring-line hover:text-ink",
            )}
          >
            {c ? CATEGORY_LABELS[c] : "All"}
          </button>
        ))}
      </div>

      {tools === undefined ? (
        <Skeleton />
      ) : tools.length === 0 ? (
        <EmptyState
          title={category ? `No ${CATEGORY_LABELS[category].toLowerCase()} listed yet` : "No tools listed yet"}
          body="Got something in the shed? Lending it is how the loop gets going."
          action={
            <Link href="/my-listings" className={buttonClass()}>
              List a tool
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tools.map((tool) => (
            <Card key={tool._id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-medium">{tool.name}</h3>
                  <p className="text-xs text-muted">
                    {CATEGORY_LABELS[tool.category]} · {tool.condition} condition
                  </p>
                </div>
                <ToolStatusPill status={tool.status} />
              </div>
              {tool.description && <p className="mt-3 line-clamp-3 text-sm text-stone-600">{tool.description}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">Lent by {tool.isOwn ? "you" : tool.ownerName}</span>
                {tool.ownerTrusted && <TrustedBadge />}
              </div>
              {tool.booked.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  Booked {tool.booked.map((b) => formatRange(b.startDate, b.endDate)).join(", ")}
                </p>
              )}

              {tool.isOwn ? (
                <div className="mt-4">
                  <Pill tone="stone">Your listing</Pill>
                </div>
              ) : requesting === tool._id ? (
                <RequestForm toolId={tool._id} booked={tool.booked} onDone={() => setRequesting(null)} />
              ) : (
                <Button variant="secondary" className="mt-4" onClick={() => setRequesting(tool._id)}>
                  Request to borrow
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
