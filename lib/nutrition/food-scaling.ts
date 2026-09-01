import type { MealPlanFoodCategory } from "@/lib/types/meal-plan";
import { SERVING_OVERRIDES } from "@/lib/usda/serving-overrides";

// Foods whose realistic serving is a discrete unit (an egg, a tbsp of oil,
// a spoon of nut butter) rather than a continuously divisible weight.
// Scaling these by a fractional factor would produce something like
// "1.34 eggs", which nothing in the UI can render sensibly — USDA's own
// per-portion unit labels ("egg", "tbsp") are discarded before reaching
// UsdaFoodMatch (see lib/usda/client.ts), so there's no data to support
// realistic whole-unit stepping instead. These hold at their resolved
// quantity; the day's target is hit by scaling the remaining bulk foods.
// Seeded from SERVING_OVERRIDES (foods USDA itself doesn't portion by
// weight) plus a few other common discrete/spoonable items.
const FIXED_UNIT_KEYWORDS = [
  ...Object.keys(SERVING_OVERRIDES),
  "egg",
  "eggs",
  "capsule",
  "tablet",
  "softgel",
  "gummy",
  "supplement",
  "butter",
  "honey",
];

export function classifyScalability(food: {
  foodName: string;
  category: MealPlanFoodCategory;
  quantityGrams: number;
  isUserAdded: boolean;
}): boolean {
  // Foods the user typed in themselves are deliberate choices, never
  // auto-scaled — same principle that already protects them from being
  // wiped out by a meal swap.
  if (food.isUserAdded) return false;

  const name = food.foodName.trim().toLowerCase();
  if (FIXED_UNIT_KEYWORDS.some((keyword) => name.includes(keyword))) return false;

  // Small "other"-category items (condiments, spices, small extras) that
  // aren't already covered by the keyword list — a weak but useful proxy
  // for "this isn't a bulk, weighable component of the meal."
  if (food.category === "other" && food.quantityGrams <= 20) return false;

  return true;
}

// Realistic single-meal portion ceilings, checked keyword-first — whole
// nuts/seeds are classified "protein" by the proposal prompt (same
// bucket as legumes/tofu/meat) and would otherwise inherit that much
// higher cap. Oils/condiments aren't listed here because they're already
// excluded from scaling entirely via FIXED_UNIT_KEYWORDS/SERVING_OVERRIDES.
const NUT_SEED_KEYWORDS = [
  "almond",
  "walnut",
  "cashew",
  "pistachio",
  "pecan",
  "macadamia",
  "hazelnut",
  "peanut",
  "pumpkin seed",
  "sunflower seed",
  "sesame seed",
  "hemp seed",
  "flaxseed",
  "flax seed",
];

const NUT_SEED_CAP_GRAMS = 40;

const CATEGORY_CAP_GRAMS: Record<MealPlanFoodCategory, number> = {
  vegetable: 100,
  fruit: 150,
  carb: 200,
  protein: 220,
  dairy: 250,
  other: 20,
};

export function getMaxGramsForFood(food: { food_name: string; category: MealPlanFoodCategory }): number {
  const name = food.food_name.trim().toLowerCase();
  if (NUT_SEED_KEYWORDS.some((keyword) => name.includes(keyword))) return NUT_SEED_CAP_GRAMS;
  return CATEGORY_CAP_GRAMS[food.category];
}

export interface ScalableFood {
  food_name: string;
  category: MealPlanFoodCategory;
  quantityGrams: number;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  isScalable: boolean;
}

const MIN_SCALE_FACTOR = 0.6;
const GRAM_ROUNDING_STEP = 5;
const DEFAULT_TOLERANCE_KCAL = 125;
const DEFAULT_TOLERANCE_PROTEIN_G = 10;

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function scaleMacro(value: number | null, factor: number): number | null {
  if (value === null) return null;
  return Math.round(value * factor * 10) / 10;
}

// Applies `rawFactor` to every food matched by `matches`, clamping each
// food's resulting quantity to its own realistic portion cap (rather than
// a single ratio applied identically to every food) — this is what
// prevents e.g. 235g of raw spinach or 295g of cooked lentils. A minimum
// factor still applies so a food is never scaled down to an unrealistic
// sliver either.
function applyFactor<T extends ScalableFood>(foods: T[], matches: (food: T) => boolean, rawFactor: number): T[] {
  const factor = Math.max(MIN_SCALE_FACTOR, rawFactor);

  return foods.map((food) => {
    if (!matches(food) || food.quantityGrams <= 0) return food;

    const cap = getMaxGramsForFood(food);
    const desiredGrams = roundToStep(food.quantityGrams * factor, GRAM_ROUNDING_STEP);
    const newQuantityGrams = Math.max(GRAM_ROUNDING_STEP, Math.min(cap, desiredGrams));
    const actualFactor = newQuantityGrams / food.quantityGrams;

    return {
      ...food,
      quantityGrams: newQuantityGrams,
      calories: scaleMacro(food.calories, actualFactor),
      proteinG: scaleMacro(food.proteinG, actualFactor),
      carbsG: scaleMacro(food.carbsG, actualFactor),
      fatG: scaleMacro(food.fatG, actualFactor),
    };
  });
}

/** Clamps every scalable food's quantity down to its realistic per-food
 *  cap (see getMaxGramsForFood), independent of any calorie/protein
 *  target — so a food is never left at an unrealistic single-sitting
 *  amount even on a path that never runs target-convergence scaling
 *  (e.g. the single gap-fill food added when a meal is still short after
 *  everything else is already capped). */
export function clampToRealisticPortions<T extends ScalableFood>(foods: T[]): T[] {
  return foods.map((food) => {
    if (!food.isScalable || food.quantityGrams <= 0) return food;

    const cap = getMaxGramsForFood(food);
    if (food.quantityGrams <= cap) return food;

    const actualFactor = cap / food.quantityGrams;
    return {
      ...food,
      quantityGrams: cap,
      calories: scaleMacro(food.calories, actualFactor),
      proteinG: scaleMacro(food.proteinG, actualFactor),
      carbsG: scaleMacro(food.carbsG, actualFactor),
      fatG: scaleMacro(food.fatG, actualFactor),
    };
  });
}

export interface ScaleTargets {
  calories: number;
  proteinG: number;
}

export interface ScaleTolerances {
  kcal: number;
  proteinG: number;
}

export interface ScaleResult<T> {
  foods: T[];
  calorieGapKcal: number;
  proteinGapG: number;
}

const DEFAULT_TOLERANCES: ScaleTolerances = { kcal: DEFAULT_TOLERANCE_KCAL, proteinG: DEFAULT_TOLERANCE_PROTEIN_G };

/** Two-pass, per-food-capped scaling toward both a calorie and a protein
 *  target. Pass 1 biases scalable `protein`-category foods toward the
 *  protein target first — protein is the macro that silently gets
 *  squeezed out by calorie-only scaling. Pass 2 scales the remaining
 *  non-protein scalable foods toward the calorie target. Every food is
 *  clamped to a realistic per-food gram cap (see getMaxGramsForFood)
 *  rather than a blanket ratio, so convergence never produces an
 *  unrealistic single-food portion. Returns the final signed gaps
 *  (positive = still under target) so a caller can decide whether a
 *  gap-fill food is warranted — a plan that can't fully converge within
 *  realistic caps is left as close as they allow, honestly reflected in
 *  the actual totals shown to the user rather than forced to match. */
export function scaleFoodsToTargets<T extends ScalableFood>(
  foods: T[],
  targets: ScaleTargets,
  tolerances: ScaleTolerances = DEFAULT_TOLERANCES
): ScaleResult<T> {
  let working = foods;

  // Pass 1: protein.
  const currentProtein = working.reduce((sum, f) => sum + (f.proteinG ?? 0), 0);
  const proteinGap = targets.proteinG - currentProtein;
  if (Math.abs(proteinGap) > tolerances.proteinG) {
    const isProteinScalable = (f: T) => f.isScalable && f.category === "protein";
    const proteinFoodsTotal = working.filter(isProteinScalable).reduce((sum, f) => sum + (f.proteinG ?? 0), 0);
    if (proteinFoodsTotal > 0) {
      const rawFactor = (proteinFoodsTotal + proteinGap) / proteinFoodsTotal;
      working = applyFactor(working, isProteinScalable, rawFactor);
    }
  }

  // Pass 2: calories, using whatever's left after pass 1's protein foods
  // are set. Non-protein scalable foods (carb/vegetable/fruit/dairy/
  // other) absorb the remaining gap.
  const currentTotal = working.reduce((sum, f) => sum + (f.calories ?? 0), 0);
  if (Math.abs(currentTotal - targets.calories) > tolerances.kcal) {
    const isNonProteinScalable = (f: T) => f.isScalable && f.category !== "protein";
    const nonProteinTotal = working.filter(isNonProteinScalable).reduce((sum, f) => sum + (f.calories ?? 0), 0);
    if (nonProteinTotal > 0) {
      const fixedAndProteinTotal = currentTotal - nonProteinTotal;
      const remainingTarget = targets.calories - fixedAndProteinTotal;
      const rawFactor = remainingTarget / nonProteinTotal;
      working = applyFactor(working, isNonProteinScalable, rawFactor);
    }
  }

  const finalProtein = working.reduce((sum, f) => sum + (f.proteinG ?? 0), 0);
  const finalCalories = working.reduce((sum, f) => sum + (f.calories ?? 0), 0);

  return {
    foods: working,
    calorieGapKcal: targets.calories - finalCalories,
    proteinGapG: targets.proteinG - finalProtein,
  };
}
