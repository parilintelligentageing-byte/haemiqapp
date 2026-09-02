import type { Gender } from "@/lib/types/user-profile";
import type { MicronutrientTotals } from "@/lib/nutrition/micronutrients";

// Standard adult (19-50) reference values — RDA where one exists, Adequate
// Intake (AI) otherwise, sodium as the CDC daily upper limit rather than a
// value to hit. Non-binary/prefer-not-to-say profiles get the average of
// the male/female values, same averaging precedent used for the BMR offset
// in lib/nutrition/calorie-targets.ts, since there's no third clinical
// reference figure to fall back on.
export interface MicronutrientTargets {
  ironMg: number;
  vitaminB12Mcg: number;
  folateMcg: number;
  vitaminDMcg: number;
  calciumMg: number;
  potassiumMg: number;
  sodiumMg: number;
  fiberG: number;
}

const FEMALE_TARGETS: MicronutrientTargets = {
  ironMg: 18,
  vitaminB12Mcg: 2.4,
  folateMcg: 400,
  vitaminDMcg: 15,
  calciumMg: 1000,
  potassiumMg: 2600,
  sodiumMg: 2300,
  fiberG: 25,
};

const MALE_TARGETS: MicronutrientTargets = {
  ironMg: 8,
  vitaminB12Mcg: 2.4,
  folateMcg: 400,
  vitaminDMcg: 15,
  calciumMg: 1000,
  potassiumMg: 3400,
  sodiumMg: 2300,
  fiberG: 38,
};

function average(a: number, b: number): number {
  return Math.round(((a + b) / 2) * 10) / 10;
}

const AVERAGE_TARGETS: MicronutrientTargets = {
  ironMg: average(FEMALE_TARGETS.ironMg, MALE_TARGETS.ironMg),
  vitaminB12Mcg: FEMALE_TARGETS.vitaminB12Mcg,
  folateMcg: FEMALE_TARGETS.folateMcg,
  vitaminDMcg: FEMALE_TARGETS.vitaminDMcg,
  calciumMg: FEMALE_TARGETS.calciumMg,
  potassiumMg: average(FEMALE_TARGETS.potassiumMg, MALE_TARGETS.potassiumMg),
  sodiumMg: FEMALE_TARGETS.sodiumMg,
  fiberG: average(FEMALE_TARGETS.fiberG, MALE_TARGETS.fiberG),
};

export function calculateMicronutrientTargets(gender: Gender | null): MicronutrientTargets {
  if (gender === "female") return FEMALE_TARGETS;
  if (gender === "male") return MALE_TARGETS;
  return AVERAGE_TARGETS;
}

// Sodium is the one nutrient here where "more" isn't better — it's a
// ceiling, not a value to hit — so it's evaluated and messaged the other
// way round from everything else.
const CEILING_NUTRIENTS = new Set<keyof MicronutrientTargets>(["sodiumMg"]);

const ACCURACY_TOLERANCE = 0.01;

const SHORTFALL_NOTES: Record<keyof MicronutrientTargets, string> = {
  ironMg: "Add more iron-rich foods (red meat, spinach, lentils) to close the gap.",
  vitaminB12Mcg: "Add more B12-rich foods (eggs, dairy, fish, fortified cereal) to close the gap.",
  folateMcg: "Add more folate-rich foods (leafy greens, legumes, citrus) to close the gap.",
  vitaminDMcg: "Add more vitamin D sources (oily fish, fortified milk, eggs) or safe sun exposure to close the gap.",
  calciumMg: "Add more calcium-rich foods (dairy, fortified plant milk, leafy greens) to close the gap.",
  potassiumMg: "Add more potassium-rich foods (bananas, potatoes, beans) to close the gap.",
  sodiumMg: "You're comfortably under your sodium limit.",
  fiberG: "Add more fiber-rich foods (whole grains, legumes, vegetables) to close the gap.",
};

const CEILING_EXCEEDED_NOTES: Record<string, string> = {
  sodiumMg: "Swap in lower-sodium options where you can to get back under your daily limit.",
};

export interface MicronutrientGap {
  key: keyof MicronutrientTotals;
  targetKey: keyof MicronutrientTargets;
  label: string;
  unit: string;
  actual: number;
  target: number;
  isCeiling: boolean;
  withinTolerance: boolean;
  note: string | null;
}

const NUTRIENT_META: Array<{
  totalsKey: keyof MicronutrientTotals;
  targetsKey: keyof MicronutrientTargets;
  label: string;
  unit: string;
}> = [
  { totalsKey: "ironMg", targetsKey: "ironMg", label: "Iron", unit: "mg" },
  { totalsKey: "vitaminB12Mcg", targetsKey: "vitaminB12Mcg", label: "Vitamin B12", unit: "mcg" },
  { totalsKey: "folateMcg", targetsKey: "folateMcg", label: "Folate", unit: "mcg" },
  { totalsKey: "vitaminDMcg", targetsKey: "vitaminDMcg", label: "Vitamin D", unit: "mcg" },
  { totalsKey: "calciumMg", targetsKey: "calciumMg", label: "Calcium", unit: "mg" },
  { totalsKey: "potassiumMg", targetsKey: "potassiumMg", label: "Potassium", unit: "mg" },
  { totalsKey: "sodiumMg", targetsKey: "sodiumMg", label: "Sodium", unit: "mg" },
  { totalsKey: "fiberG", targetsKey: "fiberG", label: "Fiber", unit: "g" },
];

/** Compares actual micronutrient totals against RDA/AI targets, ~1%
 *  tolerance. Never throws or blocks — an unreachable target just gets a
 *  gap + a friendly, food-specific suggestion rather than an error. Sodium
 *  is treated as a ceiling: "gap" there means over the limit, not under. */
export function evaluateMicronutrientGaps(
  totals: MicronutrientTotals,
  targets: MicronutrientTargets
): MicronutrientGap[] {
  return NUTRIENT_META.map(({ totalsKey, targetsKey, label, unit }) => {
    const actual = totals[totalsKey];
    const target = targets[targetsKey];
    const isCeiling = CEILING_NUTRIENTS.has(targetsKey);
    const deviation = target > 0 ? Math.abs(actual - target) / target : 0;

    let withinTolerance: boolean;
    let note: string | null;

    if (isCeiling) {
      withinTolerance = actual <= target * (1 + ACCURACY_TOLERANCE);
      note = withinTolerance ? SHORTFALL_NOTES[targetsKey] : CEILING_EXCEEDED_NOTES[targetsKey];
    } else {
      withinTolerance = deviation <= ACCURACY_TOLERANCE;
      note = withinTolerance ? null : actual < target ? SHORTFALL_NOTES[targetsKey] : null;
    }

    return { key: totalsKey, targetKey: targetsKey, label, unit, actual, target, isCeiling, withinTolerance, note };
  });
}
