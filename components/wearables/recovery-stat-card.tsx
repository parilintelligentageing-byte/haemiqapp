import { statusColorVar } from "@/lib/vitality/calculate-score";

export function RecoveryStatCard({
  label,
  score,
  footnote,
}: {
  label: string;
  score: number | null;
  footnote?: string;
}) {
  const color = statusColorVar(score);

  return (
    <div className="rounded-[20px] border border-line bg-surface p-6">
      <span className="font-sans text-[10px] font-semibold tracking-[0.14em] text-text-soft uppercase">
        {label}
      </span>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-serif text-4xl text-ink italic" style={{ color }}>
          {score ?? "—"}
        </span>
      </div>
      {footnote && <p className="mt-2 font-sans text-xs text-text-soft">{footnote}</p>}
    </div>
  );
}
