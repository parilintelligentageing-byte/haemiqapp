import Link from "next/link";
import type { Gender } from "@/lib/types/user-profile";
import { statusTextForScore, type VitalityScore } from "@/lib/vitality/calculate-score";
import { BodySilhouette } from "@/components/vitality/body-silhouette";
import { ScoreRing } from "@/components/vitality/score-ring";
import type { ReportState } from "@/lib/actions/vitality";

export function VitalityHero({
  gender,
  reportState,
  score,
}: {
  gender: Gender | null;
  reportState: ReportState;
  score: VitalityScore | null;
}) {
  if (reportState === "processing") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 rounded-[24px] border border-line bg-surface px-8 py-16 text-center">
        <div className="h-10 w-10 animate-pulse rounded-full bg-teal/30" aria-hidden="true" />
        <div>
          <p className="font-serif text-2xl text-ink italic">Reading your blood…</p>
          <p className="mt-2 font-sans text-sm text-text-soft">
            Your Vitality Score will appear here once processing finishes.
          </p>
        </div>
      </div>
    );
  }

  const overall = score?.overall ?? null;
  const statusText = statusTextForScore(overall);

  return (
    <div className="relative overflow-hidden py-4">
      {/* Subtle on-brand accent — plain midnight blue otherwise, per the
          2026-08 rollback of the time-of-day gradient background. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-1/4 -right-1/4 h-[60%] w-[60%] rounded-full bg-teal/[0.05] blur-3xl"
      />

      <div className="relative flex flex-col items-center gap-10 md:flex-row md:items-center md:justify-center md:gap-12">
        <div className="flex h-[420px] items-end justify-center">
          <BodySilhouette gender={gender} score={overall} />
        </div>

        <div className="flex flex-col items-center gap-6">
          <ScoreRing score={overall} statusText={statusText} />

          {reportState === "empty" && (
            <Link
              href="#blood-reports"
              className="rounded-full bg-teal px-6 py-2.5 font-sans text-sm font-semibold tracking-wide text-paper uppercase transition-opacity hover:opacity-90"
            >
              Upload your first blood report
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function VitalityHeroSkeleton() {
  return (
    <div className="flex flex-col items-center gap-10 md:flex-row md:items-center md:justify-center md:gap-12">
      <div className="h-[420px] w-[160px] animate-pulse rounded-[40px] bg-surface" />
      <div className="h-[220px] w-[220px] animate-pulse rounded-full bg-surface" />
    </div>
  );
}
