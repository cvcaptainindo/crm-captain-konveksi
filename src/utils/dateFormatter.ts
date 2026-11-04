/**
 * Utility to format timestamps into Indonesia Western Time (WIB, Asia/Jakarta, UTC+7).
 * Strictly outputs format: "DD-MM-YYYY HH:mm WIB"
 * Example: "26-10-2026 20:45 WIB"
 */
export function formatToWIB(input: string | number | Date | null | undefined): string {
  if (!input) return '-';

  let d: Date;
  if (input instanceof Date) {
    d = input;
  } else if (typeof input === 'number') {
    d = new Date(input);
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return '-';
    // If bare SQL format "YYYY-MM-DD HH:mm:ss" without explicit offset, treat as +07:00 (WIB)
    // since database connection is configured with timezone +07:00 and NOW() yields WIB time.
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(trimmed)) {
      const iso = trimmed.replace(' ', 'T') + '+07:00';
      d = new Date(iso);
    } else {
      d = new Date(trimmed);
    }
  } else {
    return '-';
  }

  if (isNaN(d.getTime())) return '-';

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(d);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const hour = partMap.hour === '24' ? '00' : partMap.hour;

  return `${partMap.day}-${partMap.month}-${partMap.year} ${hour}:${partMap.minute} WIB`;
}

/**
 * Returns today's date in Asia/Jakarta (WIB) as YYYY-MM-DD
 */
export function getTodayWIBDateString(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}
