"use client";

import { SignInButton } from "@clerk/nextjs";
import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import Link from "next/link";
import { Logo } from "@/components/AppShell";
import { Button, buttonClass, EmptyState, Pill } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { CATEGORY_LABELS } from "@/convex/lib/constants";

export default function Home() {
  // Public query: returns only { name, category } so nothing about owners is exposed here.
  const tools = useQuery(api.tools.publicList);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <Logo />
        <Authenticated>
          <Link href="/tools" className="text-sm font-medium text-accent hover:underline">
            Open LendLoop →
          </Link>
        </Authenticated>
      </div>

      <section className="py-16 text-center sm:py-24">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Borrow what you need.
          <br />
          <span className="text-accent">Lend what you don&apos;t.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-muted">
          A tool-lending board for your neighbourhood. List the drill gathering dust, borrow a tent for the weekend.
        </p>
        <div className="mt-8">
          <Unauthenticated>
            <SignInButton mode="modal" forceRedirectUrl="/tools">
              <Button className="px-5 py-2.5">Sign in to lend or borrow</Button>
            </SignInButton>
          </Unauthenticated>
          <Authenticated>
            <Link href="/tools" className={buttonClass("primary", "px-5 py-2.5")}>
              Browse tools
            </Link>
          </Authenticated>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Available right now</h2>
        {tools === undefined ? (
          <div className="h-32 animate-pulse rounded-xl bg-stone-200/60" />
        ) : tools.length === 0 ? (
          <EmptyState title="Nothing listed yet" body="Be the first neighbour to lend something." />
        ) : (
          <ul className="divide-y divide-line rounded-xl bg-white ring-1 ring-line">
            {tools.map((tool, i) => (
              <li key={i} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="truncate">{tool.name}</span>
                <Pill tone="stone">{CATEGORY_LABELS[tool.category]}</Pill>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
