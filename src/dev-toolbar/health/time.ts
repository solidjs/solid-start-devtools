/** The wall-clock time a record made on the `performance.now()` clock was made at. */
export function wallTime(at: number, now = Date.now(), tick = performance.now()): number {
  return now - (tick - at);
}

/** How long ago, as the list shows it: "now", "12s", "3m", "2h", "4d". */
export function formatAge(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** The time of day as hh:mm:ss on a 24-hour clock. */
export function formatClock(time: number): string {
  const date = new Date(time);
  const parts = [date.getHours(), date.getMinutes(), date.getSeconds()];
  const padded: string[] = [];
  for (const part of parts) padded.push(String(part).padStart(2, '0'));
  return padded.join(':');
}
