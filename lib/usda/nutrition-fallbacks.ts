// Narrow, explicitly curated fallback for USDA foods whose matched record
// has no proximate/energy data on file at all (calories, protein, carbs,
// and fat all missing) — this happens for a small number of Foundation
// Foods entries that only report a detailed fatty-acid/vitamin breakdown
// and skip the standard summary nutrients entirely. Used ONLY when a
// match's own record returns null for every macro; never overrides real
// USDA numbers when even some of them are present.
//
// Static and human-reviewed — never AI-generated. Each entry's values are
// sourced from USDA's own adjacent record for the same food (cited per
// entry), not invented. Keys are exact matches (after trim + lowercase)
// against the AI-proposed food_name — same discipline as
// lib/usda/serving-overrides.ts, but for missing macros, not portions.
export interface NutritionFallback {
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  note: string;
}

export const NUTRITION_FALLBACKS: Record<string, NutritionFallback> = {
  "extra virgin olive oil": {
    caloriesPer100g: 884,
    proteinPer100g: 0,
    carbsPer100g: 0,
    fatPer100g: 100,
    note:
      'USDA Foundation fdcId 748608 ("Oil, olive, extra virgin") has no proximate/energy nutrients on file — only a fatty-acid breakdown. Values taken from USDA SR Legacy fdcId 171413 ("Oil, olive, salad or cooking"), USDA\'s own complete reference for the same food.',
  },
};

export function findNutritionFallback(foodName: string): NutritionFallback | null {
  return NUTRITION_FALLBACKS[foodName.trim().toLowerCase()] ?? null;
}
