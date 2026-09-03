import type { CollectionStats } from "../api/types.js";
import { formatRuntime, formatYearSpan } from "../format.js";

export function StatsPanel({ stats }: { stats: CollectionStats }) {
  return (
    <div className="stats-panel">
      <Stat label="Films" value={String(stats.movieCount)} />
      <Stat label="Total runtime" value={formatRuntime(stats.totalRuntimeMinutes)} />
      <Stat
        label="Avg rating"
        value={stats.averageRating == null ? "—" : `★ ${stats.averageRating.toFixed(1)}`}
        hint={stats.ratedCount > 0 ? `${stats.ratedCount} rated` : undefined}
      />
      <Stat label="Years" value={formatYearSpan(stats.releaseYearSpan)} />
      <div className="stat genres">
        <span className="stat-label">Genres</span>
        {stats.genreBreakdown.length === 0 ? (
          <span className="stat-value">—</span>
        ) : (
          <div className="genre-chips">
            {stats.genreBreakdown.slice(0, 6).map((g) => (
              <span key={g.genre} className="chip">
                {g.genre} <span className="muted">{g.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint muted">{hint}</span>}
    </div>
  );
}
