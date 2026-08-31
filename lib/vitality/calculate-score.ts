import { getBiomarkerMeta, type VitalityCategoryKey } from "@/lib/vitality/biomarker-metadata";
import type { Biomarker } from "@/lib/types/blood-report";

export type { VitalityCategoryKey };

export const CATEGORY_KEYS: VitalityCategoryKey[] = [
  "metabolic",
  "cardiovascular",
  "hormonal",
  "nutritional",
  "inflammation",
  "liverKidney",
];

export const CATEGORY_LABELS: Record<VitalityCategoryKey, string> = {
  metabolic: "Metabolic",
  cardiovascular: "Cardiovascular",
  hormonal: "Hormonal",
  nutritional: "Nutritional",
  inflammation: "Inflammation",
  liverKidney: "Liver & Kidney",
};

// Draft copy — placeholder content per the build spec, to be refined later.
export const CATEGORY_EXPLANATIONS: Record<VitalityCategoryKey, string> = {
  metabolic:
    "How efficiently your body processes energy from food — blood sugar regulation, insulin sensitivity, and fat metabolism all live here.",
  cardiovascular:
    "The health of your heart and blood vessels, largely reflected in how your cholesterol particles are balanced.",
  hormonal:
    "The signaling molecules that regulate energy, mood, reproduction, and metabolism throughout your body.",
  nutritional:
    "Whether your body has enough of the vitamins and minerals it needs to function and repair itself.",
  inflammation:
    "General markers of inflammation in the body — useful early signals for a wide range of health issues.",
  liverKidney:
    "How well your liver and kidneys are filtering waste and processing everything you eat, drink, and take.",
};

export interface ScoredBiomarker {
  biomarker: Biomarker;
  score: number | null;
}

export interface VitalityCategoryResult {
  score: number | null;
  biomarkerCount: number;
}

export interface VitalityScore {
  overall: number | null;
  categories: Record<VitalityCategoryKey, VitalityCategoryResult>;
}

function ratioScore(ratio: number): number {
  if (ratio >= 1.5) return 100;
  if (ratio >= 1.2) return 80;
  if (ratio >= 1.0) return 60;
  if (ratio >= 0.8) return 30;
  return 10;
}

// Single-bound fallback for biomarkers where only a floor ("higher is
// better", e.g. HDL) or only a ceiling ("lower is better", e.g. LDL)
// exists. Scored by distance from the one bound that's actually there,
// since there's no midpoint to measure against.
function scoreSingleBound(value: number, low: number | null, high: number | null): number | null {
  if (low !== null && low > 0) return ratioScore(value / low);
  if (high !== null && value > 0) return ratioScore(high / value);
  return null;
}

// Two-sided: scored by distance from the range's midpoint, normalized to
// half the range width (0 = at midpoint, 1 = at either bound).
function scoreTwoSided(value: number, low: number, high: number): number | null {
  const range = high - low;
  if (range <= 0) return null;
  const mid = (low + high) / 2;
  const halfRange = range / 2;
  const distanceRatio = Math.abs(value - mid) / halfRange;

  if (distanceRatio <= 0.6) return 100; // middle 60% of the range
  if (distanceRatio <= 1.0) return 80; // outer 40%, still within range
  if (distanceRatio <= 1.4) return 60; // within ~20% of range beyond the bound
  if (distanceRatio <= 1.8) return 30; // significantly out
  return 10; // critically out
}

export function scoreBiomarkerValue(
  value: number,
  low: number | null,
  high: number | null
): number | null {
  if (low !== null && high !== null) return scoreTwoSided(value, low, high);
  return scoreSingleBound(value, low, high);
}

function emptyGroups(): Record<VitalityCategoryKey, ScoredBiomarker[]> {
  return {
    metabolic: [],
    cardiovascular: [],
    hormonal: [],
    nutritional: [],
    inflammation: [],
    liverKidney: [],
  };
}

/** Groups biomarkers by category (a biomarker can land in more than one —
 *  e.g. ferritin counts toward both nutritional and inflammation), each
 *  carrying its own individually computed score for display in the
 *  category drawer. Biomarkers with no metadata match or no scorable
 *  reference range are omitted. */
export function groupBiomarkersByCategory(
  biomarkers: Biomarker[]
): Record<VitalityCategoryKey, ScoredBiomarker[]> {
  const groups = emptyGroups();

  for (const biomarker of biomarkers) {
    if (biomarker.value === null) continue;
    const meta = getBiomarkerMeta(biomarker.name);
    if (!meta) continue;

    const score = scoreBiomarkerValue(
      biomarker.value,
      biomarker.reference_range_low,
      biomarker.reference_range_high
    );

    for (const category of meta.categories) {
      groups[category].push({ biomarker, score });
    }
  }

  return groups;
}

export function calculateVitalityScore(biomarkers: Biomarker[]): VitalityScore {
  const groups = groupBiomarkersByCategory(biomarkers);

  const categories = {} as Record<VitalityCategoryKey, VitalityCategoryResult>;
  const categoryAverages: number[] = [];

  for (const key of CATEGORY_KEYS) {
    const scored = groups[key].filter((s): s is ScoredBiomarker & { score: number } => s.score !== null);
    if (scored.length === 0) {
      categories[key] = { score: null, biomarkerCount: 0 };
      continue;
    }
    const average = Math.round(scored.reduce((sum, s) => sum + s.score, 0) / scored.length);
    categories[key] = { score: average, biomarkerCount: scored.length };
    categoryAverages.push(average);
  }

  const overall =
    categoryAverages.length > 0
      ? Math.round(categoryAverages.reduce((sum, s) => sum + s, 0) / categoryAverages.length)
      : null;

  return { overall, categories };
}

export function statusTextForScore(score: number | null): string {
  if (score === null) return "Add your first blood report";
  if (score >= 90) return "Excellent shape.";
  if (score >= 80) return "Great shape overall.";
  if (score >= 70) return "Steady — with room to improve.";
  if (score >= 60) return "Needs some attention.";
  return "Let's work on this together.";
}

/** CSS color for a score, matching the four-tier palette used across the
 *  hero, category tiles, and biomarker impact lines. */
export function statusColorVar(score: number | null): string {
  if (score === null) return "var(--color-line)";
  if (score >= 90) return "var(--color-teal)";
  if (score >= 80) return "var(--color-sage)";
  if (score >= 70) return "var(--color-gold)";
  return "var(--color-alert)";
}
