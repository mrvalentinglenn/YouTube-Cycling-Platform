// Renders one row from scoring_view as a card, matching preview.png. Takes
// the row itself plus the current `comparison` value, since whether the
// outlier badge shows at all depends on that filter, not on the row alone.

const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

// likes/comments are nullable in the database — NULL means the creator
// disabled the feature, which is a different fact from "zero engagement".
// Showing "0" here would blur that distinction right after the schema and
// CLAUDE.md go out of their way to preserve it, so a null renders as "—"
// instead of a number.
function formatStat(value) {
  if (value === null || value === undefined) return '—'
  return compactNumberFormatter.format(value)
}

function formatDuration(durationSeconds) {
  const totalSeconds = Math.max(0, Math.floor(durationSeconds ?? 0))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

// One decimal, an explicit "×" — never a percentage. Locked in CLAUDE.md:
// the Outlier Score must never be shown as though it were one.
function formatOutlierScore(outlierScore) {
  return `${outlierScore.toFixed(1)}×`
}

function EyeIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function CommentIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </svg>
  )
}

function ThumbIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  )
}

export default function VideoCard({ video, comparison }) {
  const hasOutlierScore = video.outlier_score !== null && video.outlier_score !== undefined
  const showOutlierBadge = comparison === 'relative' && hasOutlierScore

  return (
    <a
      href={`https://www.youtube.com/watch?v=${video.video_id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-full"
    >
      <div
        className={`relative overflow-hidden rounded-lg bg-neutral-800 ${
          video.is_short ? 'aspect-[9/16]' : 'aspect-video'
        }`}
      >
        <img src={video.thumbnail_url} alt="" className="h-full w-full object-cover" />

        {showOutlierBadge && (
          <span className="absolute top-1 left-1 rounded bg-violet-600 px-1.5 py-0.5 text-xs font-semibold text-white">
            {formatOutlierScore(video.outlier_score)}
          </span>
        )}

        {video.is_provisional && (
          <span
            title="Provisional Score — baseline drawn from a limited number of reference videos."
            className="absolute top-1 right-1 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-neutral-400"
          >
            Provisional
          </span>
        )}

        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-xs text-white">
          {formatDuration(video.duration_seconds)}
        </span>
      </div>

      <div className="mt-2">
        <p className="line-clamp-2 text-sm font-medium text-white">{video.title}</p>

        <div className="mt-1 flex items-center gap-2">
          {video.avatar_url ? (
            <img
              src={video.avatar_url}
              alt=""
              className="h-5 w-5 flex-shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="h-5 w-5 flex-shrink-0 rounded-full bg-neutral-700" />
          )}
          <span className="truncate text-xs text-neutral-400">{video.channel_name}</span>
        </div>

        <div className="mt-1 flex items-center gap-3 text-xs text-neutral-400">
          <span className="flex items-center gap-1">
            <EyeIcon className="h-3.5 w-3.5" />
            {formatStat(video.views)}
          </span>
          <span className="flex items-center gap-1">
            <CommentIcon className="h-3.5 w-3.5" />
            {formatStat(video.comments)}
          </span>
          <span className="flex items-center gap-1">
            <ThumbIcon className="h-3.5 w-3.5" />
            {formatStat(video.likes)}
          </span>
        </div>
      </div>
    </a>
  )
}
