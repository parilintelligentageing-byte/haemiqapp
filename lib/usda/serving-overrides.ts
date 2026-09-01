// Narrow, explicitly curated fallback for foods where USDA's own portion
// data doesn't map to a realistic recipe-component serving — either a
// single food-label-style reference amount unrelated to how much goes
// into a dish, or no portion data at all. Used ONLY as a last resort
// when USDA has nothing better; never overrides USDA's real
// nutrition-per-100g figures, only the quantity they get scaled to.
//
// Static and human-reviewed — never AI-generated. Keys are exact matches
// (after trim + lowercase) against the AI-proposed food_name. If a new
// spelling shows up for one of these foods, add it as its own key rather
// than introducing fuzzy matching here.
export interface ServingOverride {
  grams: number;
  note: string;
}

export const SERVING_OVERRIDES: Record<string, ServingOverride> = {
  "chia seeds": {
    grams: 15,
    note: "~1 tbsp; USDA's only recorded portion (45g) is a food-label reference amount, not a recipe serving.",
  },
  garlic: {
    grams: 6,
    note: "~2 cloves; USDA's only recorded portion (85g) is roughly a whole bulb.",
  },
  "almond butter": {
    grams: 32,
    note: "2 tbsp, standard nut-butter serving; USDA has no portion data on file (defaults to 100g).",
  },
  "extra virgin olive oil": {
    grams: 14,
    note: "1 tbsp, standard cooking/dressing serving; USDA's only recorded portion (91g) is a bulk reference amount.",
  },
  "maple syrup": {
    grams: 20,
    note: "1 tbsp, standard topping serving; USDA's median portion (83g) is skewed up by a 1/4-cup serving entry.",
  },
  hummus: {
    grams: 30,
    note: "~2 tbsp, standard dip serving; USDA's median portion (131g) is skewed up by a 1-cup entry.",
  },
};

export function findServingOverride(foodName: string): ServingOverride | null {
  return SERVING_OVERRIDES[foodName.trim().toLowerCase()] ?? null;
}
