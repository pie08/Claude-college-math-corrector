/** "Today, 9:17 PM", "Yesterday, 4:02 PM", "Mon, Oct 5" or "Sep 28, 2025". */
export function formatWhen(timestamp: number, now: Date = new Date()): string {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (timestamp >= startOfToday) return `Today, ${time}`;
  if (timestamp >= startOfToday - day) return `Yesterday, ${time}`;
  if (timestamp >= startOfToday - 6 * day) {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}
