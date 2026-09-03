/** Minutes → "2h 8m" / "48m" / "—" for zero. Display-only; math stays in minutes. */
export function formatRuntime(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatYearSpan(span: { earliest: number; latest: number } | null): string {
  if (!span) return "—";
  return span.earliest === span.latest ? `${span.earliest}` : `${span.earliest}–${span.latest}`;
}
