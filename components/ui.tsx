import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-stone-700",
  secondary: "bg-white text-ink ring-1 ring-line hover:bg-stone-50",
  danger: "bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50",
  ghost: "text-muted hover:text-ink hover:bg-stone-100",
};

/** Button styling for links (never nest a <button> inside an <a>). */
export function buttonClass(variant: Variant = "primary", className?: string): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    className,
  );
}

export function Button({
  variant = "primary",
  busy = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || busy}
      className={buttonClass(variant, className)}
    >
      {busy && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl bg-card p-5 ring-1 ring-line", className)}>{children}</div>;
}

export type Tone = "green" | "amber" | "red" | "stone" | "blue";
const TONES: Record<Tone, string> = {
  green: "bg-green-50 text-green-800 ring-green-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-800 ring-red-200",
  stone: "bg-stone-100 text-stone-700 ring-stone-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
};

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1", TONES[tone])}>
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white/50 px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-stone-200/60" />
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-line placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-accent";

export function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
        {count !== undefined && <span className="rounded-full bg-stone-200 px-2 text-xs text-stone-700">{count}</span>}
      </h2>
      {children}
    </section>
  );
}
