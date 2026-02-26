type DurationOptions = {
  includeSeconds?: boolean;
  empty?: string;
};

export function parseDate(value?: string | null): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

export function formatDuration(
  start?: string | null,
  finish?: string | null,
  options: DurationOptions = {}
): string {
  const empty = options.empty ?? "";
  if (!start || !finish) return empty;
  const startMs = Date.parse(start);
  const finishMs = Date.parse(finish);
  if (Number.isNaN(startMs) || Number.isNaN(finishMs) || finishMs < startMs) {
    return empty;
  }
  const totalSeconds = Math.floor((finishMs - startMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const includeSeconds = options.includeSeconds ?? false;
  if (hours > 0) {
    return includeSeconds
      ? `${hours}h ${minutes}m ${seconds}s`
      : `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function formatBytes(value?: number | null): string {
  if (!value) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[idx]}`;
}
