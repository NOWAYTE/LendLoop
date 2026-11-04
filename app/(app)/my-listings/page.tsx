"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { ToolStatusPill } from "@/components/status";
import { ToolForm, type ToolInput } from "@/components/ToolForm";
import { Button, Card, EmptyState, PageHeader, Pill, Section, Skeleton } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CATEGORY_LABELS } from "@/convex/lib/constants";
import { withToast } from "@/lib/errors";

export default function MyListingsPage() {
  const tools = useQuery(api.tools.mine);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState<Id<"tools"> | null>(null);
  const [confirming, setConfirming] = useState<Id<"tools"> | null>(null);

  return (
    <>
      <PageHeader title="My listings" subtitle="Tools you're lending to the neighbourhood." />

      <Section title="Add a tool">
        <Card>
          <ToolForm
            submitLabel="List tool"
            onSubmit={(input) => withToast(create(input), "Tool listed.")}
          />
        </Card>
      </Section>

      <Section title="Listed" count={tools?.length}>
        {tools === undefined ? (
          <Skeleton rows={2} />
        ) : tools.length === 0 ? (
          <EmptyState title="You haven't listed anything yet" body="Add your first tool above." />
        ) : (
          <div className="space-y-3">
            {tools.map((tool) => (
              <Card key={tool._id}>
                {editing === tool._id ? (
                  <ToolForm
                    initial={{
                      name: tool.name,
                      category: tool.category,
                      condition: tool.condition,
                      description: tool.description,
                    }}
                    submitLabel="Save changes"
                    onCancel={() => setEditing(null)}
                    onSubmit={async (input: ToolInput) => {
                      const ok = await withToast(update({ toolId: tool._id, ...input }), "Changes saved.");
                      if (ok) setEditing(null);
                      return ok;
                    }}
                  />
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{tool.name}</h3>
                        <ToolStatusPill status={tool.status} />
                        {tool.pendingCount > 0 && (
                          <Link href="/incoming">
                            <Pill tone="amber">
                              {tool.pendingCount} request{tool.pendingCount > 1 ? "s" : ""} waiting
                            </Pill>
                          </Link>
                        )}
                      </div>
                      <p className="text-xs text-muted">
                        {CATEGORY_LABELS[tool.category]} · {tool.condition} condition
                      </p>
                      {tool.description && <p className="mt-2 text-sm text-stone-600">{tool.description}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => setEditing(tool._id)}>
                        Edit
                      </Button>
                      {confirming === tool._id ? (
                        <Button
                          variant="danger"
                          onClick={async () => {
                            setConfirming(null);
                            await withToast(remove({ toolId: tool._id }), "Listing removed.");
                          }}
                        >
                          Confirm delete
                        </Button>
                      ) : (
                        <Button
                          variant="danger"
                          disabled={tool.pendingCount + tool.activeLoanCount > 0}
                          title={
                            tool.pendingCount + tool.activeLoanCount > 0
                              ? "Resolve open requests and loans first"
                              : undefined
                          }
                          onClick={() => setConfirming(tool._id)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
