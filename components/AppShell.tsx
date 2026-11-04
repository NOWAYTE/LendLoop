"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { Button, cx, Skeleton } from "./ui";

/** Creates/refreshes the caller's Convex user row once Convex has their Clerk token. */
function useStoredUser() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const store = useMutation(api.users.store);
  const [stored, setStored] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    store().then(
      () => !cancelled && setStored(true),
      () => !cancelled && setStored(false),
    );
    return () => {
      cancelled = true;
      setStored(false);
    };
  }, [isAuthenticated, store]);

  return { isLoading: isLoading || (isAuthenticated && !stored), isAuthenticated: isAuthenticated && stored };
}

const LINKS = [
  { href: "/tools", label: "Browse" },
  { href: "/my-listings", label: "My listings" },
  { href: "/my-requests", label: "My requests" },
  { href: "/incoming", label: "Incoming" },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-lg bg-accent text-sm text-white">L</span>
      LendLoop
    </Link>
  );
}

function Nav() {
  const pathname = usePathname();
  const me = useQuery(api.users.me);
  // Showing the link is a convenience; admin queries check the role on the server.
  const links = me?.role === "admin" ? [...LINKS, { href: "/admin", label: "Admin" }] : LINKS;
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Logo />
        <nav className="-mx-1 flex flex-1 gap-1 overflow-x-auto">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cx(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm",
                pathname.startsWith(link.href) ? "bg-white font-medium ring-1 ring-line" : "text-muted hover:text-ink",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <UserButton />
      </div>
    </header>
  );
}

/** Layout for every signed-in page: nav, and content only once the user row exists. */
export function AppShell({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useStoredUser();
  if (!isLoading && !isAuthenticated) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <Logo />
        <p className="mt-6 text-muted">Your session has ended.</p>
        <SignInButton mode="modal">
          <Button className="mt-4">Sign in</Button>
        </SignInButton>
      </main>
    );
  }
  return (
    <>
      {isAuthenticated ? <Nav /> : <div className="h-14 border-b border-line" />}
      <main className="mx-auto max-w-5xl px-4 py-8">{isLoading ? <Skeleton /> : children}</main>
    </>
  );
}
