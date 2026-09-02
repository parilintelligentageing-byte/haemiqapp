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
const DEFAULT_TOLERANCE_CARB_G = 15;
const DEFAULT_TOLERANCE_FAT_G = 8;

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
  carbsG: number;
  fatG: number;
}

export interface ScaleTolerances {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface ScaleResult<T> {
  foods: T[];
  calorieGapKcal: number;
  proteinGapG: number;
  carbGapG: number;
  fatGapG: number;
}

const DEFAULT_TOLERANCES: ScaleTolerances = {
  kcal: DEFAULT_TOLERANCE_KCAL,
  proteinG: DEFAULT_TOLERANCE_PROTEIN_G,
  carbsG: DEFAULT_TOLERANCE_CARB_G,
  fatG: DEFAULT_TOLERANCE_FAT_G,
};

// A food's fat-as-share-of-its-own-calories — used to split the residual
// (non-protein, non-carb) foods into a low-fat and high-fat subgroup, so
// the calorie/fat pass below can tell which subgroup to lean on.
function fatKcalShare(food: ScalableFood): number {
  if (!food.calories || food.calories <= 0) return 0;
  return ((food.fatG ?? 0) * 9) / food.calories;
}

const HIGH_FAT_SHARE_THRESHOLD = 0.35;

// A protein-category food's fat cost per gram of protein it supplies —
// scale-invariant (both figures grow with quantity together), so this can
// be read directly off a food's current values at any point. Used to
// prefer genuinely lean protein sources (chicken breast ~0.12, cod ~0.04,
// lentils ~0.04, chickpeas ~0.29) over moderate-to-high-fat ones (tofu/
// tempeh ~0.47, salmon ~0.65, almonds ~2.4) when closing the protein gap —
// two foods can supply the same protein at very different fat costs, so
// this is a strict improvement (same protein accuracy) rather than a
// trade-off against protein's higher priority.
function fatPerProteinRatio(food: ScalableFood): number {
  if (!food.proteinG || food.proteinG <= 0) return Infinity;
  return (food.fatG ?? 0) / food.proteinG;
}

const LEAN_PROTEIN_FAT_RATIO = 0.35;

/** Priority-ordered, per-food-capped scaling toward calorie, protein,
 *  carb, and fat targets (in that priority order — see the task brief).
 *  Each pass locks in a macro using foods that don't get touched again by
 *  a lower-priority pass, so a higher-priority pass's result is never
 *  clobbered on the way down:
 *
 *  Pass 1 (protein): scalable `protein`-category foods absorb the protein
 *  gap — untouched by anything after. Split into a lean and a fatty
 *  subgroup by fat-per-gram-of-protein, so a growing gap is closed with
 *  the lean subgroup first (same protein, less fat) and a shrinking one
 *  (protein already over) trims the fatty subgroup first — falling back
 *  to the other subgroup only once the preferred one is capped out.
 *
 *  Pass 2 (carbs): scalable `carb`-category foods absorb the carb gap —
 *  likewise untouched after.
 *
 *  Pass 3 (calories + fat): the remaining scalable foods (vegetable,
 *  fruit, dairy, other) are split into a low-fat and a high-fat subgroup
 *  by each food's own fat-kcal share, giving two independent knobs for the
 *  two remaining targets — solved as an exact 2-variable linear system
 *  when both subgroups exist and are distinguishable (see comments below),
 *  falling back to a calorie-only close otherwise. A final unconditional
 *  correction re-closes any remaining calorie gap across both subgroups
 *  together, since calories outranks fat even when the 2-variable solve
 *  got clamped short by realistic per-food caps.
 *
 *  Every food is clamped to a realistic per-food gram cap (see
 *  getMaxGramsForFood) rather than a blanket ratio, so convergence never
 *  produces an unrealistic single-food portion. Returns the final signed
 *  gaps (positive = still under target) so a caller can decide whether a
 *  gap-fill food is warranted — a plan that can't fully converge within
 *  realistic caps is left as close as they allow, honestly reflected in
 *  the actual totals shown to the user rather than forced to match. */
export function scaleFoodsToTargets<T extends ScalableFood>(
  foods: T[],
  targets: ScaleTargets,
  tolerances: ScaleTolerances = DEFAULT_TOLERANCES
): ScaleResult<T> {
  let working = foods;

  // Pass 1: protein — lean sources first (see fatPerProteinRatio above).
  const isProteinScalable = (f: T) => f.isScalable && f.category === "protein";
  const isLeanProtein = (f: T) => isProteinScalable(f) && fatPerProteinRatio(f) < LEAN_PROTEIN_FAT_RATIO;
  const isFattyProtein = (f: T) => isProteinScalable(f) && !isLeanProtein(f);

  const currentProtein = working.reduce((sum, f) => sum + (f.proteinG ?? 0), 0);
  const proteinGap = targets.proteinG - currentProtein;
  if (Math.abs(proteinGap) > tolerances.proteinG) {
    const leanTotal = working.filter(isLeanProtein).reduce((sum, f) => sum + (f.proteinG ?? 0), 0);
    const fattyTotal = working.filter(isFattyProtein).reduce((sum, f) => sum + (f.proteinG ?? 0), 0);

    // Growing the gap draws on lean foods first (same protein, less fat);
    // shrinking it (protein already over) trims fatty foods first (same
    // protein removed, more fat cut). Either way, the other subgroup only
    // gets touched once the preferred one is exhausted within its caps.
    const preferLean = proteinGap > 0;
    const preferredTotal = preferLean ? leanTotal : fattyTotal;
    const fallbackTotal = preferLean ? fattyTotal : leanTotal;
    const preferredMatcher = preferLean ? isLeanProtein : isFattyProtein;
    const fallbackMatcher = preferLean ? isFattyProtein : isLeanProtein;

    let remainingGap = proteinGap;
    if (preferredTotal > 0) {
      const rawFactor = (preferredTotal + remainingGap) / preferredTotal;
      working = applyFactor(working, preferredMatcher, rawFactor);
      const achieved = working.filter(preferredMatcher).reduce((sum, f) => sum + (f.proteinG ?? 0), 0);
      remainingGap -= achieved - preferredTotal;
    }
    if (Math.abs(remainingGap) > tolerances.proteinG && fallbackTotal > 0) {
      const rawFactor = (fallbackTotal + remainingGap) / fallbackTotal;
      working = applyFactor(working, fallbackMatcher, rawFactor);
    }
  }

  // Pass 2: carbs.
  const currentCarbs = working.reduce((sum, f) => sum + (f.carbsG ?? 0), 0);
  const carbGap = targets.carbsG - currentCarbs;
  if (Math.abs(carbGap) > tolerances.carbsG) {
    const isCarbScalable = (f: T) => f.isScalable && f.category === "carb";
    const carbFoodsTotal = working.filter(isCarbScalable).reduce((sum, f) => sum + (f.carbsG ?? 0), 0);
    if (carbFoodsTotal > 0) {
      const rawFactor = (carbFoodsTotal + carbGap) / carbFoodsTotal;
      working = applyFactor(working, isCarbScalable, rawFactor);
    }
  }

  // Pass 3: calories + fat, using whatever's left after passes 1-2.
  const isResidualScalable = (f: T) => f.isScalable && f.category !== "protein" && f.category !== "carb";
  const isHighFat = (f: T) => isResidualScalable(f) && fatKcalShare(f) >= HIGH_FAT_SHARE_THRESHOLD;
  const isLowFat = (f: T) => isResidualScalable(f) && !isHighFat(f);

  const lowFatCal = working.filter(isLowFat).reduce((sum, f) => sum + (f.calories ?? 0), 0);
  const highFatCal = working.filter(isHighFat).reduce((sum, f) => sum + (f.calories ?? 0), 0);
  const lowFatFat = working.filter(isLowFat).reduce((sum, f) => sum + (f.fatG ?? 0), 0);
  const highFatFat = working.filter(isHighFat).reduce((sum, f) => sum + (f.fatG ?? 0), 0);

  const totalCalBefore = working.reduce((sum, f) => sum + (f.calories ?? 0), 0);
  const totalFatBefore = working.reduce((sum, f) => sum + (f.fatG ?? 0), 0);
  const fixedCal = totalCalBefore - lowFatCal - highFatCal;
  const fixedFat = totalFatBefore - lowFatFat - highFatFat;

  const calorieGapBefore = targets.calories - totalCalBefore;
  const fatGapBefore = targets.fatG - totalFatBefore;

  if (Math.abs(calorieGapBefore) > tolerances.kcal || Math.abs(fatGapBefore) > tolerances.fatG) {
    const cTarget = targets.calories - fixedCal;
    const fTarget = targets.fatG - fixedFat;
    // Determinant of the 2x2 system below — near-zero when one subgroup
    // is empty or both subgroups have (near-)identical fat-per-calorie
    // density, i.e. there's no real second knob to solve fat with.
    const determinant = lowFatCal * highFatFat - highFatCal * lowFatFat;

    if (lowFatCal > 0 && highFatCal > 0 && Math.abs(determinant) > 1e-6) {
      // Exact solve: two independent subgroup factors for the two
      // remaining targets, the same "one knob per target" approach that
      // makes passes 1-2 exact. applyFactor's own per-food caps and
      // MIN_SCALE_FACTOR floor clamp an infeasible solved factor back to
      // something realistic — that's what makes this degrade gracefully
      // instead of erroring when the accepted foods can't actually reach
      // both targets at once.
      const xLow = (cTarget * highFatFat - highFatCal * fTarget) / determinant;
      const xHigh = (lowFatCal * fTarget - lowFatFat * cTarget) / determinant;
      working = applyFactor(working, isLowFat, xLow);
      working = applyFactor(working, isHighFat, xHigh);
    } else {
      // Only one fat-density subgroup exists (or they're indistinguishable)
      // — close the calorie gap alone; fat rides along as a byproduct.
      const residualTotal = lowFatCal + highFatCal;
      if (residualTotal > 0) {
        const rawFactor = (residualTotal + calorieGapBefore) / residualTotal;
        working = applyFactor(working, isResidualScalable, rawFactor);
      }
    }
  }

  // Calories outranks fat even when the solve above got clamped short —
  // one more blanket nudge across both subgroups together closes whatever
  // calorie gap remains, accepting further fat drift as the trade-off.
  const calAfterSolve = working.reduce((sum, f) => sum + (f.calories ?? 0), 0);
  const remainingCalorieGap = targets.calories - calAfterSolve;
  if (Math.abs(remainingCalorieGap) > tolerances.kcal) {
    const residualTotal = working.filter(isResidualScalable).reduce((sum, f) => sum + (f.calories ?? 0), 0);
    if (residualTotal > 0) {
      const rawFactor = (residualTotal + remainingCalorieGap) / residualTotal;
      working = applyFactor(working, isResidualScalable, rawFactor);
    }
  }

  const finalProtein = working.reduce((sum, f) => sum + (f.proteinG ?? 0), 0);
  const finalCarbs = working.reduce((sum, f) => sum + (f.carbsG ?? 0), 0);
  const finalFat = working.reduce((sum, f) => sum + (f.fatG ?? 0), 0);
  const finalCalories = working.reduce((sum, f) => sum + (f.calories ?? 0), 0);

  return {
    foods: working,
    calorieGapKcal: targets.calories - finalCalories,
    proteinGapG: targets.proteinG - finalProtein,
    carbGapG: targets.carbsG - finalCarbs,
    fatGapG: targets.fatG - finalFat,
  };
}
