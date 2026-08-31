const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 104;

export function ScoreRing({
  score,
  statusText,
}: {
  score: number | null;
  statusText: string;
}) {
  const offset = score === null ? 100 : 100 - score;

  return (
    <div className="relative flex h-[220px] w-[220px] shrink-0 items-center justify-center">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="rgba(245, 238, 219, 0.16)"
          strokeWidth={6}
        />
        {score !== null && (
          <>
            <style>{`
              @keyframes score-ring-fill {
                from { stroke-dashoffset: 100; }
                to { stroke-dashoffset: ${offset}; }
              }
            `}</style>
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke="var(--color-teal)"
              strokeWidth={6}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={100}
              strokeDashoffset={offset}
              style={{ animation: "score-ring-fill 1.5s ease-out forwards" }}
            />
          </>
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
        <span className="font-sans text-[9px] font-bold tracking-[0.28em] text-gold uppercase">
          Vitality
        </span>
        <span className="font-serif text-7xl font-extralight text-ink italic">
          {score ?? "—"}
        </span>
        <span className="font-serif text-[13px] text-teal italic">{statusText}</span>
      </div>
    </div>
  );
}
