import type { UsdaFoodDetail } from "@/lib/usda/client";

// USDA nutrient numbers — stable across dataTypes, same scheme as the
// macro NUTRIENT_NUMBERS in lib/usda/client.ts. Folate falls back to the
// DFE figure when the "total" figure isn't on file for a given food.
const NUTRIENT_NUMBERS = {
  iron: "303",
  vitaminB12: "418",
  folate: "417",
  folateDfeFallback: "435",
  vitaminD: "328",
  calcium: "301",
  potassium: "306",
  sodium: "307",
  fiber: "291",
} as const;

export interface MicronutrientsPer100g {
  ironMg: number | null;
  vitaminB12Mcg: number | null;
  folateMcg: number | null;
  vitaminDMcg: number | null;
  calciumMg: number | null;
  potassiumMg: number | null;
  sodiumMg: number | null;
  fiberG: number | null;
}

export function extractMicronutrientsPer100g(detail: UsdaFoodDetail): MicronutrientsPer100g {
  const byNumber = (num: string) => detail.foodNutrients.find((n) => n.nutrient.number === num)?.amount ?? null;

  return {
    ironMg: byNumber(NUTRIENT_NUMBERS.iron),
    vitaminB12Mcg: byNumber(NUTRIENT_NUMBERS.vitaminB12),
    folateMcg: byNumber(NUTRIENT_NUMBERS.folate) ?? byNumber(NUTRIENT_NUMBERS.folateDfeFallback),
    vitaminDMcg: byNumber(NUTRIENT_NUMBERS.vitaminD),
    calciumMg: byNumber(NUTRIENT_NUMBERS.calcium),
    potassiumMg: byNumber(NUTRIENT_NUMBERS.potassium),
    sodiumMg: byNumber(NUTRIENT_NUMBERS.sodium),
    fiberG: byNumber(NUTRIENT_NUMBERS.fiber),
  };
}

export interface MicronutrientTotals {
  ironMg: number;
  vitaminB12Mcg: number;
  folateMcg: number;
  vitaminDMcg: number;
  calciumMg: number;
  potassiumMg: number;
  sodiumMg: number;
  fiberG: number;
}

export function emptyMicronutrientTotals(): MicronutrientTotals {
  return {
    ironMg: 0,
    vitaminB12Mcg: 0,
    folateMcg: 0,
    vitaminDMcg: 0,
    calciumMg: 0,
    potassiumMg: 0,
    sodiumMg: 0,
    fiberG: 0,
  };
}

function addScaled(
  totals: MicronutrientTotals,
  per100g: MicronutrientsPer100g,
  quantityGrams: number
): MicronutrientTotals {
  const factor = quantityGrams / 100;
  return {
    ironMg: totals.ironMg + (per100g.ironMg ?? 0) * factor,
    vitaminB12Mcg: totals.vitaminB12Mcg + (per100g.vitaminB12Mcg ?? 0) * factor,
    folateMcg: totals.folateMcg + (per100g.folateMcg ?? 0) * factor,
    vitaminDMcg: totals.vitaminDMcg + (per100g.vitaminDMcg ?? 0) * factor,
    calciumMg: totals.calciumMg + (per100g.calciumMg ?? 0) * factor,
    potassiumMg: totals.potassiumMg + (per100g.potassiumMg ?? 0) * factor,
    sodiumMg: totals.sodiumMg + (per100g.sodiumMg ?? 0) * factor,
    fiberG: totals.fiberG + (per100g.fiberG ?? 0) * factor,
  };
}

/** Sums the core micronutrient set across a batch of foods, each carrying
 *  its cached USDA detail payload and the actual (possibly scaled)
 *  quantity it was served at in the plan. */
export function sumMicronutrients(
  foods: Array<{ detail: UsdaFoodDetail; quantityGrams: number }>
): MicronutrientTotals {
  return foods.reduce(
    (totals, { detail, quantityGrams }) => addScaled(totals, extractMicronutrientsPer100g(detail), quantityGrams),
    emptyMicronutrientTotals()
  );
}
