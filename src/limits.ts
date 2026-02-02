import type { CreditsSnapshot, RateLimitSnapshot, RateLimitWindow } from "./codexRpc";

export type LimitsRow = {
  account: string;
  fiveHour: string;
  fiveReset: string;
  weekly: string;
  weeklyReset: string;
  credits: string;
  source: string;
};

function formatPercent(value?: number): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}%`;
}

function formatReset(resetsAt?: number | null): string {
  if (!resetsAt) return "-";
  const date = new Date(resetsAt * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${mm}-${dd} ${hh}:${min}`;
}

function pickWindows(snapshot: RateLimitSnapshot): { five?: RateLimitWindow | null; weekly?: RateLimitWindow | null } {
  const primary = snapshot.primary ?? undefined;
  const secondary = snapshot.secondary ?? undefined;

  let five: RateLimitWindow | undefined;
  let weekly: RateLimitWindow | undefined;

  if (primary?.windowDurationMins === 300) five = primary;
  if (secondary?.windowDurationMins === 300) five = secondary;
  if (primary?.windowDurationMins === 10080) weekly = primary;
  if (secondary?.windowDurationMins === 10080) weekly = secondary;

  if (!five && primary && primary !== weekly) five = primary;
  if (!weekly && secondary && secondary !== five) weekly = secondary;

  return { five, weekly };
}

function formatCredits(credits?: CreditsSnapshot | null): string {
  if (!credits) return "-";
  if (credits.unlimited) return "unlimited";
  if (credits.hasCredits === false) return "none";
  if (credits.balance) return credits.balance;
  return "-";
}

export function rateLimitsToRow(
  snapshot: RateLimitSnapshot,
  account: string,
  source: string,
): LimitsRow {
  const { five, weekly } = pickWindows(snapshot);
  return {
    account,
    fiveHour: five ? formatPercent(five.usedPercent) : "-",
    fiveReset: five ? formatReset(five.resetsAt) : "-",
    weekly: weekly ? formatPercent(weekly.usedPercent) : "-",
    weeklyReset: weekly ? formatReset(weekly.resetsAt) : "-",
    credits: formatCredits(snapshot.credits),
    source,
  };
}

function pad(value: string, width: number): string {
  if (value.length >= width) return value;
  return value + " ".repeat(width - value.length);
}

export function renderLimitsTable(rows: LimitsRow[]): string[] {
  const headers = ["account", "5h", "weekly", "5h reset", "weekly reset", "credits", "source"];
  const columns = headers.map((h) => h.length);

  for (const row of rows) {
    const values = [
      row.account,
      row.fiveHour,
      row.weekly,
      row.fiveReset,
      row.weeklyReset,
      row.credits,
      row.source,
    ];
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i] ?? "";
      const current = columns[i] ?? 0;
      if (v.length > current) columns[i] = v.length;
    }
  }

  const lines: string[] = [];
  lines.push(headers.map((h, i) => pad(h, columns[i] ?? 0)).join("  "));
  lines.push(columns.map((w) => "-".repeat(w ?? 0)).join("  "));

  for (const row of rows) {
    const values = [
      row.account,
      row.fiveHour,
      row.weekly,
      row.fiveReset,
      row.weeklyReset,
      row.credits,
      row.source,
    ];
    lines.push(values.map((v, i) => pad(v ?? "", columns[i] ?? 0)).join("  "));
  }

  return lines;
}
