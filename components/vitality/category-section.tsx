"use client";

import { useState } from "react";
import {
  CATEGORY_EXPLANATIONS,
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  statusColorVar,
  statusTextForScore,
  type ScoredBiomarker,
  type VitalityCategoryKey,
  type VitalityScore,
} from "@/lib/vitality/calculate-score";
import { getBiomarkerMeta, getRangeType } from "@/lib/vitality/biomarker-metadata";
import { IMPROVEMENT_TIPS } from "@/lib/vitality/improvement-tips";
import { computeRangeBar, rangeStatusLabel, RangeBar, type RangeStatus } from "@/components/vitality/range-bar";

const ROMAN = ["i", "ii", "iii", "iv"];

function ChevronIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="mt-0.5 shrink-0 text-text-soft/60"
    >
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getRangeStatus(scored: ScoredBiomarker): RangeStatus | null {
  if (scored.biomarker.value === null) return null;
  const layout = computeRangeBar(
    scored.biomarker.value,
    scored.biomarker.reference_range_low,
    scored.biomarker.reference_range_high,
    getRangeType(scored.biomarker.name)
  );
  return layout?.status ?? null;
}

function impactLine(scored: ScoredBiomarker): { text: string; color: string } {
  const { biomarker, score } = scored;
  if (score === null) {
    return { text: "Not enough data to assess impact.", color: "var(--color-text-soft)" };
  }
  if (score >= 80) {
    return { text: "✓ Contributing positively to score", color: statusColorVar(score) };
  }
  const pointsOff = 100 - score;
  const direction =
    biomarker.flag === "low"
      ? "↓ Below optimal range"
      : biomarker.flag === "high"
        ? "↑ Above optimal range"
        : biomarker.flag === "critical"
          ? "⚠ Significantly out of range"
          : "◦ Outside optimal range";
  return { text: `${direction} · taking ${pointsOff} points off score`, color: statusColorVar(score) };
}

function CategoryTile({
  categoryKey,
  score,
  selected,
  dimmed,
  onSelect,
}: {
  categoryKey: VitalityCategoryKey;
  score: number | null;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
}) {
  const color = statusColorVar(score);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col items-center gap-3 rounded-2xl border bg-surface px-3 py-4 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-teal hover:bg-white/[0.03] ${
        selected ? "border-teal shadow-[0_0_20px_rgba(79,184,175,0.25)]" : "border-line"
      } ${dimmed ? "opacity-60" : "opacity-100"}`}
    >
      <span className="font-serif text-3xl text-ink italic" style={{ color: score === null ? undefined : color }}>
        {score ?? "—"}
      </span>
      <span className="font-sans text-[10px] font-semibold tracking-[0.14em] text-text-soft uppercase">
        {CATEGORY_LABELS[categoryKey]}
      </span>
      <span className="h-[3px] w-full overflow-hidden rounded-full bg-line">
        <span
          className="block h-full rounded-full"
          style={{ width: `${score ?? 0}%`, backgroundColor: color }}
        />
      </span>
    </button>
  );
}

function BiomarkerCard({ scored }: { scored: ScoredBiomarker }) {
  const { biomarker, score } = scored;
  const meta = getBiomarkerMeta(biomarker.name);
  const rangeType = getRangeType(biomarker.name);
  const impact = impactLine(scored);
  const borderColor = statusColorVar(score);
  const layout =
    biomarker.value !== null
      ? computeRangeBar(
          biomarker.value,
          biomarker.reference_range_low,
          biomarker.reference_range_high,
          rangeType
        )
      : null;

  return (
    <div className="rounded-xl bg-paper p-4" style={{ borderLeft: `3px solid ${borderColor}` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-sans text-sm font-medium text-ink">{biomarker.name}</p>
          <p className="mt-1 font-serif text-lg text-ink italic">
            {layout ? rangeStatusLabel(layout.status) : `${biomarker.value ?? "—"} ${biomarker.unit ?? ""}`}
          </p>
        </div>
        <ChevronIcon />
      </div>

      {layout && biomarker.value !== null && (
        <RangeBar
          value={biomarker.value}
          unit={biomarker.unit}
          low={biomarker.reference_range_low}
          high={biomarker.reference_range_high}
          rangeType={rangeType}
        />
      )}

      {meta && (
        <p className="mt-4 font-sans text-xs leading-relaxed text-text-soft">{meta.description}</p>
      )}
      <p
        className="mt-2 font-sans text-[11px] tracking-[0.08em]"
        style={{ color: impact.color }}
      >
        {impact.text}
      </p>
    </div>
  );
}

function CategoryDrawer({
  categoryKey,
  categoryScore,
  biomarkers,
  onClose,
}: {
  categoryKey: VitalityCategoryKey;
  categoryScore: number | null;
  biomarkers: ScoredBiomarker[];
  onClose: () => void;
}) {
  const tips = IMPROVEMENT_TIPS[categoryKey].slice(0, 4);
  const color = statusColorVar(categoryScore);

  const outOfRange = biomarkers.filter((b) => {
    const status = getRangeStatus(b);
    return status === "below_range" || status === "above_range";
  });
  const inRange = biomarkers.filter((b) => !outOfRange.includes(b));

  return (
    <div className="mx-auto w-full max-w-[1000px] rounded-[24px] border border-teal bg-surface p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-serif text-3xl text-ink italic">{CATEGORY_LABELS[categoryKey]}</h3>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="font-serif text-2xl italic" style={{ color }}>
              {categoryScore ?? "—"}
            </span>
            <span className="font-serif text-sm text-teal italic">
              {statusTextForScore(categoryScore)}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-text-soft px-3.5 py-2 font-sans text-xs text-text-soft transition-colors hover:border-ink hover:text-ink"
        >
          × Close
        </button>
      </div>

      <p className="mt-4 max-w-[720px] font-sans text-sm leading-relaxed text-text-soft">
        {CATEGORY_EXPLANATIONS[categoryKey]}
      </p>

      {biomarkers.length === 0 ? (
        <>
          <h4 className="mt-8 font-sans text-xs font-bold tracking-[0.2em] text-gold uppercase">
            Biomarkers in this category
          </h4>
          <p className="mt-3 font-sans text-sm text-text-soft">
            No biomarkers in this category were found in your latest report.
          </p>
        </>
      ) : (
        <>
          {outOfRange.length > 0 && (
            <>
              <h4 className="mt-8 font-sans text-xs font-bold tracking-[0.2em] text-gold uppercase">
                Out of range ({outOfRange.length})
              </h4>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {outOfRange.map((scored) => (
                  <BiomarkerCard key={scored.biomarker.id} scored={scored} />
                ))}
              </div>
            </>
          )}
          {inRange.length > 0 && (
            <>
              <h4 className="mt-8 font-sans text-xs font-bold tracking-[0.2em] text-gold uppercase">
                In range ({inRange.length})
              </h4>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {inRange.map((scored) => (
                  <BiomarkerCard key={scored.biomarker.id} scored={scored} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <h4 className="mt-8 font-sans text-xs font-bold tracking-[0.2em] text-gold uppercase">
        Ways to improve
      </h4>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tips.map((tip, i) => (
          <div
            key={tip.title}
            className="flex gap-3 rounded-xl border p-4"
            style={{ backgroundColor: "rgba(230, 180, 80, 0.06)", borderColor: "rgba(230, 180, 80, 0.25)" }}
          >
            <span className="font-serif text-gold italic">{ROMAN[i]}.</span>
            <div>
              <p className="font-sans text-[13px] font-semibold text-ink">{tip.title}</p>
              <p className="mt-1 font-sans text-xs leading-relaxed text-text-soft">{tip.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div
        className="mt-8 flex gap-3 rounded-xl border p-4"
        style={{ backgroundColor: "rgba(232, 139, 125, 0.08)", borderColor: "rgba(232, 139, 125, 0.3)" }}
      >
        <span className="font-serif text-alert italic">i</span>
        <p className="font-sans text-xs leading-relaxed text-text-soft">
          These suggestions are educational, not medical advice. Please consult your GP or a
          qualified healthcare professional before starting any supplement, exercise programme, or
          dietary change based on these insights.
        </p>
      </div>
    </div>
  );
}

export function CategorySection({
  score,
  biomarkersByCategory,
}: {
  score: VitalityScore | null;
  biomarkersByCategory: Record<VitalityCategoryKey, ScoredBiomarker[]>;
}) {
  const [selected, setSelected] = useState<VitalityCategoryKey | null>(null);
  // Tracks the last category to have been open, kept mounted through the
  // closing transition — grid-template-rows only has something to
  // animate collapsing if the content is still there. Setting state
  // directly in the render body (guarded so it only fires on an actual
  // change) is the sanctioned way to derive this without an effect:
  // https://react.dev/learn/you-might-not-need-an-effect
  const [renderedCategory, setRenderedCategory] = useState<VitalityCategoryKey | null>(null);
  if (selected !== null && selected !== renderedCategory) {
    setRenderedCategory(selected);
  }

  const isExpanded = selected !== null;

  return (
    <div className="mt-14">
      <div className="mx-auto grid max-w-[1000px] grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {CATEGORY_KEYS.map((key) => {
          const categoryScore = score?.categories[key]?.score ?? null;
          return (
            <CategoryTile
              key={key}
              categoryKey={key}
              score={categoryScore}
              selected={selected === key}
              dimmed={isExpanded && selected !== key}
              onSelect={() => setSelected((current) => (current === key ? null : key))}
            />
          );
        })}
      </div>

      {/* grid-template-rows 0fr -> 1fr animates to the drawer's actual
          content height with no guessed max-height, using CSS alone. */}
      <div
        className="mx-auto grid max-w-[1000px] transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {renderedCategory && (
            <div className="pt-4">
              <div aria-hidden="true" className="mx-auto h-4 w-px bg-teal/50" />
              <CategoryDrawer
                categoryKey={renderedCategory}
                categoryScore={score?.categories[renderedCategory]?.score ?? null}
                biomarkers={biomarkersByCategory[renderedCategory]}
                onClose={() => setSelected(null)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
