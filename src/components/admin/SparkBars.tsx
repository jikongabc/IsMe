export function SparkBars({
  series,
  label,
}: {
  series: Array<{ day: string; count: number }>;
  label?: string;
}) {
  const max = Math.max(1, ...series.map((s) => s.count));
  const total = series.reduce((sum, s) => sum + s.count, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        {label ? <h2 className="font-display text-xl text-accent">{label}</h2> : null}
        <span className="font-mono text-xs text-ink-faint">Σ {total}</span>
      </div>
      {series.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted"># no series</p>
      ) : (
        <div className="mt-4 flex h-28 items-end gap-px">
          {series.map((point) => (
            <div
              key={point.day}
              title={`${point.day}: ${point.count}`}
              className="min-w-0 flex-1 bg-accent/80 transition hover:bg-accent"
              style={{ height: `${Math.max(4, Math.round((point.count / max) * 100))}%` }}
            />
          ))}
        </div>
      )}
      {series.length > 1 ? (
        <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-faint">
          <span>{series[0]?.day}</span>
          <span>{series[series.length - 1]?.day}</span>
        </div>
      ) : null}
    </div>
  );
}
