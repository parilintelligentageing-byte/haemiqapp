import type { RangeType } from "@/lib/vitality/biomarker-metadata";

export type RangeStatus = "in_range" | "below_range" | "above_range";
type PillFamily = "directional" | "three_way";

interface RangeBarLayout {
  status: RangeStatus;
  /** Percentages of total bar width, left-to-right, summing to 100. For a
   *  single-bound biomarker one of the grey segments is 0. */
  segments: { left: number; mid: number; right: number };
  segmentColors: { left: string; mid: string; right: string };
  /** Where the dot sits across the whole bar, clamped to 2-98 so it (and
   *  its floating pill) never touches the card edge. */
  dotPercent: number;
  /** Numeric labels shown under the bar at the edges of the optimal
   *  segment. Null where there's no real bound to show. */
  boundaryLabels: { left: string | null; right: string | null };
  /** True when the value sits more than 50% beyond the relevant bound —
   *  the bar visually maxes out well before that, so the pill also shows
   *  a ↑/↓ glyph to signal "further off than this bar can show." */
  isExtreme: boolean;
  /** "directional" (ceiling/floor-only: teal = good, coral = bad) vs
   *  "three_way" (two-bound: coral/neutral/gold) pill coloring. */
  pillFamily: PillFamily;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const DOT_MIN = 2;
const DOT_MAX = 98;

// Exact rgba values from the design spec — kept as named constants so the
// three branches below stay readable.
const COLOR = {
  greyDim: "rgba(245, 238, 219, 0.08)",
  creamOptimal: "rgba(245, 238, 219, 0.25)",
  tealOptimal: "rgba(79, 184, 175, 0.15)",
  coralBad: "rgba(232, 139, 125, 0.12)",
};

export function computeRangeBar(
  value: number,
  low: number | null,
  high: number | null,
  rangeType: RangeType = "two_bound"
): RangeBarLayout | null {
  // Ceiling-only (lower is better, e.g. LDL) — only rendered this way
  // when the report actually has a ceiling to measure against; otherwise
  // falls through to the generic fallbacks below.
  if (rangeType === "ceiling_only" && high !== null && high > 0) {
    const segments = { left: 0, mid: 70, right: 30 };
    const segmentColors = { left: COLOR.greyDim, mid: COLOR.tealOptimal, right: COLOR.coralBad };
    let status: RangeStatus;
    let dotPercent: number;
    let isExtreme = false;

    if (value <= high) {
      status = "in_range";
      dotPercent = clamp01(value / high) * segments.mid;
    } else {
      status = "above_range";
      const overRatio = (value - high) / high; // 0 at the ceiling, 1 at 2x the ceiling
      dotPercent = segments.mid + clamp01(overRatio) * segments.right;
      isExtreme = value > high * 1.5;
    }

    return {
      status,
      segments,
      segmentColors,
      dotPercent: clamp(dotPercent, DOT_MIN, DOT_MAX),
      boundaryLabels: { left: null, right: formatNum(high) },
      isExtreme,
      pillFamily: "directional",
    };
  }

  // Floor-only (higher is better, e.g. HDL) — mirror of ceiling-only,
  // same "only when the real bound exists" guard.
  if (rangeType === "floor_only" && low !== null && low > 0) {
    const segments = { left: 30, mid: 70, right: 0 };
    const segmentColors = { left: COLOR.coralBad, mid: COLOR.tealOptimal, right: COLOR.greyDim };
    let status: RangeStatus;
    let dotPercent: number;
    let isExtreme = false;

    if (value >= low) {
      status = "in_range";
      dotPercent = segments.left + clamp01((value - low) / (low * 2)) * segments.mid;
    } else {
      status = "below_range";
      dotPercent = clamp01(value / low) * segments.left;
      isExtreme = value < low * 0.5;
    }

    return {
      status,
      segments,
      segmentColors,
      dotPercent: clamp(dotPercent, DOT_MIN, DOT_MAX),
      boundaryLabels: { left: formatNum(low), right: null },
      isExtreme,
      pillFamily: "directional",
    };
  }

  // Two-bound (the default, and also the "metadata is missing or
  // ambiguous" fallback target) — optimal is the literal [low, high]
  // reference range, not a further-narrowed scoring band.
  if (low !== null && high !== null) {
    const range = high - low;
    if (range <= 0) return null;

    const segments = { left: 20, mid: 60, right: 20 };
    const segmentColors = { left: COLOR.greyDim, mid: COLOR.creamOptimal, right: COLOR.greyDim };
    const span = range * 0.5;
    let status: RangeStatus;
    let dotPercent: number;
    let isExtreme = false;

    if (value < low) {
      status = "below_range";
      const frac = clamp01((value - (low - span)) / span);
      dotPercent = frac * segments.left;
      isExtreme = value < low - span;
    } else if (value > high) {
      status = "above_range";
      const frac = clamp01((value - high) / span);
      dotPercent = segments.left + segments.mid + frac * segments.right;
      isExtreme = value > high + span;
    } else {
      status = "in_range";
      dotPercent = segments.left + ((value - low) / range) * segments.mid;
    }

    return {
      status,
      segments,
      segmentColors,
      dotPercent: clamp(dotPercent, DOT_MIN, DOT_MAX),
      boundaryLabels: { left: formatNum(low), right: formatNum(high) },
      isExtreme,
      pillFamily: "three_way",
    };
  }

  // A single-bound type was requested but this particular report is
  // missing that exact bound — fall back to whichever bound does exist,
  // rendered in the neutral (non-directional) style rather than guessing
  // at a color that isn't backed by real data.
  if (low !== null) {
    const segments = { left: 30, mid: 70, right: 0 };
    const segmentColors = { left: COLOR.greyDim, mid: COLOR.creamOptimal, right: COLOR.greyDim };
    if (low <= 0) return null;
    const ratio = value / low;
    const status: RangeStatus = value >= low ? "in_range" : "below_range";
    const dotPercent =
      ratio <= 1
        ? clamp01(ratio) * segments.left
        : segments.left + clamp01((ratio - 1) / 0.5) * segments.mid;

    return {
      status,
      segments,
      segmentColors,
      dotPercent: clamp(dotPercent, DOT_MIN, DOT_MAX),
      boundaryLabels: { left: formatNum(low), right: null },
      isExtreme: ratio < 0.5,
      pillFamily: "three_way",
    };
  }

  if (high !== null) {
    const segments = { left: 0, mid: 70, right: 30 };
    const segmentColors = { left: COLOR.greyDim, mid: COLOR.creamOptimal, right: COLOR.greyDim };
    if (value <= 0) return null;
    const ratio = high / value;
    const status: RangeStatus = value <= high ? "in_range" : "above_range";
    const dotPercent =
      ratio >= 1
        ? segments.mid * (1 - clamp01((ratio - 1) / 0.5))
        : segments.mid + clamp01((1 - ratio) / 0.5) * segments.right;

    return {
      status,
      segments,
      segmentColors,
      dotPercent: clamp(dotPercent, DOT_MIN, DOT_MAX),
      boundaryLabels: { left: null, right: formatNum(high) },
      isExtreme: ratio < 0.5,
      pillFamily: "three_way",
    };
  }

  return null;
}

export function rangeStatusLabel(status: RangeStatus): string {
  if (status === "below_range") return "Below range";
  if (status === "above_range") return "Above range";
  return "In range";
}

function badgeStyle(
  status: RangeStatus,
  pillFamily: PillFamily
): { background: string; border: string; color: string } {
  if (pillFamily === "directional") {
    if (status === "in_range") {
      return { background: "rgba(79, 184, 175, 0.15)", border: "var(--color-teal)", color: "var(--color-ink)" };
    }
    return { background: "rgba(232, 139, 125, 0.15)", border: "var(--color-alert)", color: "var(--color-ink)" };
  }
  if (status === "below_range") {
    return { background: "rgba(232, 139, 125, 0.15)", border: "var(--color-alert)", color: "var(--color-ink)" };
  }
  if (status === "above_range") {
    return { background: "rgba(230, 180, 80, 0.15)", border: "var(--color-gold)", color: "var(--color-ink)" };
  }
  return { background: "transparent", border: "var(--color-line)", color: "var(--color-ink)" };
}

// Centering a fixed-width pill exactly at the dot's percentage position
// makes it hang off the card edge once the dot gets close to 0% or 100%.
// Anchor from the near edge instead of centering, once the dot is within
// 15% of it.
function pillPositionStyle(dotPercent: number): { left?: string; right?: string; transform?: string } {
  if (dotPercent <= 15) return { left: `${dotPercent}%` };
  if (dotPercent >= 85) return { right: `${100 - dotPercent}%` };
  return { left: `${dotPercent}%`, transform: "translateX(-50%)" };
}

export function RangeBar({
  value,
  unit,
  low,
  high,
  rangeType = "two_bound",
}: {
  value: number;
  unit: string | null;
  low: number | null;
  high: number | null;
  rangeType?: RangeType;
}) {
  const layout = computeRangeBar(value, low, high, rangeType);
  if (!layout) return null;

  const badge = badgeStyle(layout.status, layout.pillFamily);
  const dotColor = badge.border === "var(--color-line)" ? "var(--color-ink)" : badge.border;

  return (
    <div className="mt-5">
      <div className="relative pt-8">
        <span
          className="absolute rounded-full border px-2 py-0.5 font-serif text-xs whitespace-nowrap italic"
          style={{
            ...pillPositionStyle(layout.dotPercent),
            top: 0,
            backgroundColor: badge.background,
            borderColor: badge.border,
            color: badge.color,
          }}
        >
          {formatNum(value)} {unit ?? ""}
          {layout.isExtreme && (
            <span className="ml-1 text-alert" aria-hidden="true">
              {layout.status === "above_range" ? "↑" : "↓"}
            </span>
          )}
        </span>

        <div className="flex h-1.5 w-full overflow-hidden rounded-full">
          {layout.segments.left > 0 && (
            <span
              className="h-full"
              style={{ width: `${layout.segments.left}%`, backgroundColor: layout.segmentColors.left }}
            />
          )}
          {layout.segments.mid > 0 && (
            <span
              className="h-full"
              style={{ width: `${layout.segments.mid}%`, backgroundColor: layout.segmentColors.mid }}
            />
          )}
          {layout.segments.right > 0 && (
            <span
              className="h-full"
              style={{ width: `${layout.segments.right}%`, backgroundColor: layout.segmentColors.right }}
            />
          )}
        </div>

        <span
          className="absolute top-4 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-paper"
          style={{ left: `${layout.dotPercent}%`, backgroundColor: dotColor }}
        />
      </div>

      {(layout.boundaryLabels.left || layout.boundaryLabels.right) && (
        <div
          className="mt-2 flex font-sans text-[11px] text-text-soft"
          style={{ paddingLeft: `${layout.segments.left}%`, paddingRight: `${layout.segments.right}%` }}
        >
          <span className="flex-1">{layout.boundaryLabels.left ?? ""}</span>
          <span>{layout.boundaryLabels.right ?? ""}</span>
        </div>
      )}
    </div>
  );
}
