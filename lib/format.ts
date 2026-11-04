const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fullFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const asUtc = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

/** "5 Jun – 8 Jun 2026", or "5 Jun 2026" for a single day. */
export function formatRange(startDate: string, endDate: string): string {
  if (startDate === endDate) return fullFormat.format(asUtc(startDate));
  return `${dayFormat.format(asUtc(startDate))} – ${fullFormat.format(asUtc(endDate))}`;
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "5 minutes ago", "yesterday". */
export function timeAgo(timestamp: number, now: number = Date.now()): string {
  const diff = timestamp - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return relative.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

/** Today's date (UTC) as YYYY-MM-DD, matching the server's rule. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(isoDate: string, days: number): string {
  return new Date(asUtc(isoDate).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}
