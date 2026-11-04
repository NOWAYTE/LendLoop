"use client";

import { useState } from "react";
import { CATEGORIES, CATEGORY_LABELS, CONDITIONS, LIMITS, type Category, type Condition } from "@/convex/lib/constants";
import { Button, Field, inputClass } from "./ui";

export type ToolInput = { name: string; category: Category; condition: Condition; description: string };

const EMPTY: ToolInput = { name: "", category: "power_tools", condition: "good", description: "" };

export function ToolForm({
  initial = EMPTY,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ToolInput;
  submitLabel: string;
  /** Resolves true when saved, so the form can reset. */
  onSubmit: (input: ToolInput) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [input, setInput] = useState<ToolInput>(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ToolInput>(key: K, value: ToolInput[K]) => setInput((i) => ({ ...i, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const saved = await onSubmit({ ...input, name: input.name.trim(), description: input.description.trim() });
    setBusy(false);
    if (saved && initial === EMPTY) setInput(EMPTY);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Name">
        <input
          required
          maxLength={LIMITS.toolName}
          className={inputClass}
          placeholder="e.g. Cordless drill"
          value={input.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <select className={inputClass} value={input.category} onChange={(e) => set("category", e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Condition">
          <select
            className={inputClass}
            value={input.condition}
            onChange={(e) => set("condition", e.target.value as Condition)}
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c[0]!.toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description" hint={`${input.description.length}/${LIMITS.toolDescription}`}>
        <textarea
          rows={3}
          maxLength={LIMITS.toolDescription}
          className={inputClass}
          placeholder="What's included, anything to know before borrowing"
          value={input.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" busy={busy} disabled={!input.name.trim()}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
