// Server-only USDA FoodData Central client. Never imported from a client
// component. Supplies the real nutrition numbers for AI-proposed foods —
// Claude names WHICH foods make sense, this looks up the actual grams/
// calories/macros, matching how blood-report numbers are never trusted
// from raw AI output without a grounding source.
import type { MealPlanFoodPreparation } from "@/lib/types/meal-plan";

const SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const FOOD_URL = "https://api.nal.usda.gov/fdc/v1/food";

// Foundation and SR Legacy are USDA's generic reference data (e.g. "raw"
// or "roasted" chicken breast) rather than branded packaged products —
// the right match for foods Claude names generically ("chicken breast",
// not a specific product).
const GENERIC_DATA_TYPES = "Foundation,SR Legacy";

// Distinguishes "USDA rejected/throttled this request" from "no match
// found" so the caller can stop hammering the API for the rest of the
// batch instead of quietly skipping every remaining food.
export class UsdaRateLimitError extends Error {}

interface UsdaSearchNutrient {
  nutrientId: number;
  nutrientName: string;
  nutrientNumber: string;
  unitName: string;
  value: number;
}

interface UsdaSearchFoodItem {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients: UsdaSearchNutrient[];
}

interface UsdaSearchResponse {
  foods: UsdaSearchFoodItem[];
}

interface UsdaFoodPortion {
  gramWeight: number;
  amount: number | null;
  modifier: string | null;
  measureUnit: { name: string } | null;
}

export interface UsdaFoodDetail {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients: Array<{
    nutrient: { id: number; number: string; name: string; unitName: string };
    amount?: number;
  }>;
  foodPortions?: UsdaFoodPortion[];
}

function apiKey(): string {
  return process.env.USDA_API_KEY?.trim() || "DEMO_KEY";
}

async function usdaFetch<T>(url: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ ...params, api_key: apiKey() });
  const response = await fetch(`${url}?${query.toString()}`);

  if (response.status === 429 || response.status === 403) {
    throw new UsdaRateLimitError(`USDA API rate limit hit (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(`USDA API request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

// Nutrient numbers per USDA's nutrient database — stable across
// dataTypes, unlike nutrient names which vary slightly by source.
const NUTRIENT_NUMBERS = {
  calories: "208",
  protein: "203",
  fat: "204",
  carbs: "205",
} as const;

function pickBestMatch(
  foods: UsdaSearchFoodItem[],
  preparation: MealPlanFoodPreparation | null
): UsdaSearchFoodItem | null {
  if (foods.length === 0) return null;
  if (!preparation) return foods[0];

  const prepMatch = foods.find((food) => food.description.toLowerCase().includes(preparation));
  return prepMatch ?? foods[0];
}

async function searchFoods(
  query: string,
  dataType: string | null
): Promise<UsdaSearchFoodItem[]> {
  const params: Record<string, string> = { query, pageSize: "5" };
  if (dataType) params.dataType = dataType;

  const result = await usdaFetch<UsdaSearchResponse>(SEARCH_URL, params);
  return result.foods ?? [];
}

function extractMacrosFromDetail(detail: UsdaFoodDetail): {
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
} {
  const byNumber = (num: string) =>
    detail.foodNutrients.find((n) => n.nutrient.number === num)?.amount ?? null;

  return {
    caloriesPer100g: byNumber(NUTRIENT_NUMBERS.calories),
    proteinPer100g: byNumber(NUTRIENT_NUMBERS.protein),
    carbsPer100g: byNumber(NUTRIENT_NUMBERS.carbs),
    fatPer100g: byNumber(NUTRIENT_NUMBERS.fat),
  };
}

// Picks a realistic serving size from USDA's household-measure portions
// (e.g. "1 breast = 174g") rather than an arbitrary 100g default, when
// the matched food has one on record.
function pickCommonServingGrams(portions: UsdaFoodPortion[] | undefined): number | null {
  if (!portions || portions.length === 0) return null;
  const withWeight = portions.find((p) => p.gramWeight && p.gramWeight > 0);
  return withWeight ? Math.round(withWeight.gramWeight) : null;
}

export interface UsdaFoodMatch {
  fdcId: string;
  quantityGrams: number;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  raw: unknown;
}

const DEFAULT_SERVING_GRAMS = 100;

function scale(perGram: number | null, quantityGrams: number): number | null {
  if (perGram === null) return null;
  return Math.round(((perGram / 100) * quantityGrams + Number.EPSILON) * 10) / 10;
}

// Pure transform from a USDA food detail payload to our match shape —
// shared by fresh API lookups and cached food_reference rows so a cache
// hit computes nutrition identically to a live one.
export function buildMatchFromDetail(fdcId: string, detail: UsdaFoodDetail): UsdaFoodMatch {
  const macros = extractMacrosFromDetail(detail);
  const quantityGrams = pickCommonServingGrams(detail.foodPortions) ?? DEFAULT_SERVING_GRAMS;

  return {
    fdcId,
    quantityGrams,
    calories: scale(macros.caloriesPer100g, quantityGrams),
    proteinG: scale(macros.proteinPer100g, quantityGrams),
    carbsG: scale(macros.carbsPer100g, quantityGrams),
    fatG: scale(macros.fatPer100g, quantityGrams),
    raw: detail,
  };
}

// Searches USDA FoodData Central for the best match to a food name,
// preferring generic reference data and the requested raw/cooked
// preparation, then fetches full nutrient + portion detail for that
// match. Returns null (never throws) when nothing matches — the caller
// should skip/flag that food rather than block the whole plan.
// Throws UsdaRateLimitError specifically so callers can stop the batch.
export async function searchFood(
  foodName: string,
  preparation: MealPlanFoodPreparation | null
): Promise<UsdaFoodMatch | null> {
  const query = preparation ? `${foodName} ${preparation}` : foodName;

  let candidates = await searchFoods(query, GENERIC_DATA_TYPES);
  if (candidates.length === 0) {
    candidates = await searchFoods(foodName, null);
  }
  if (candidates.length === 0) return null;

  const best = pickBestMatch(candidates, preparation);
  if (!best) return null;

  const detail = await usdaFetch<UsdaFoodDetail>(`${FOOD_URL}/${best.fdcId}`, {});
  return buildMatchFromDetail(String(best.fdcId), detail);
}
