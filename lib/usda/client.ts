// Server-only USDA FoodData Central client. Never imported from a client
// component. Supplies the real nutrition numbers for AI-proposed foods —
// Claude names WHICH foods make sense, this looks up the actual grams/
// calories/macros, matching how blood-report numbers are never trusted
// from raw AI output without a grounding source.
import type { MealPlanFoodPreparation } from "@/lib/types/meal-plan";
import { findServingOverride } from "@/lib/usda/serving-overrides";

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

// USDA describes each result as "Head, qualifier, qualifier, ..." (e.g.
// "Broccoli, cooked, boiled, drained, with salt"), sometimes with a
// parenthetical alt-name fused onto the head (e.g. "Chickpeas (garbanzo
// beans, bengal gram), mature seeds, cooked..."). Strip the parenthetical
// before splitting on the first comma so that embedded comma doesn't get
// mistaken for the head boundary.
function headSegment(description: string): string {
  const stripped = description.replace(/\([^)]*\)/g, " ").replace(/\s{2,}/g, " ").trim();
  return stripped.split(",")[0].trim().toLowerCase();
}

// USDA's head noun is usually plural ("Apples", "Chickpeas") while an
// AI-proposed food name is often singular ("apple") — strip a trailing
// "s" from both sides so that difference alone doesn't break an exact
// match.
function stripTrailingS(s: string): string {
  return s.endsWith("s") && s.length > 1 ? s.slice(0, -1) : s;
}

// Picking a match by preparation word alone is unsafe: a candidate can
// contain "raw" or "cooked" purely by coincidence while being a
// completely different food (searching "ground flaxseed raw" once
// matched "Bison, ground, raw" — wrong species entirely — ahead of the
// correctly-ranked "Flaxseed, ground", because flaxseed's own USDA name
// has no raw/cooked qualifier at all). So we first narrow to candidates
// that are actually about the requested food (by its last significant
// word), then prefer a plain/generic entry over a named variant sharing
// that word (e.g. "Broccoli, cooked" over "Broccoli raab, cooked"), and
// only then use the preparation word to pick among what's left.
function pickBestMatch(
  foods: UsdaSearchFoodItem[],
  foodName: string,
  preparation: MealPlanFoodPreparation | null
): UsdaSearchFoodItem | null {
  if (foods.length === 0) return null;

  const nameNorm = foodName.trim().toLowerCase();
  const lastWord = nameNorm.split(/\s+/).filter(Boolean).pop() ?? nameNorm;

  const nameMatches = foods.filter((food) => food.description.toLowerCase().includes(lastWord));
  const pool = nameMatches.length > 0 ? nameMatches : foods;

  const exactHead = pool.filter(
    (food) => stripTrailingS(headSegment(food.description)) === stripTrailingS(nameNorm)
  );
  const candidates = exactHead.length > 0 ? exactHead : pool;

  if (!preparation) return candidates[0];

  const prepMatch = candidates.find((food) => food.description.toLowerCase().includes(preparation));
  return prepMatch ?? candidates[0];
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
// the matched food has one on record. USDA doesn't order foodPortions by
// how "typical" a measure is, and it mixes wildly different unit scales
// for the same food (a "1 tsp"/"1 leaf" alongside a "1 head"/"1 bag" bulk
// entry) — taking the first or the smallest can land on either extreme
// (a whole bulk head of broccoli, or a single spinach leaf). The median
// of the on-file portions consistently lands closest to an actual
// everyday serving (e.g. "1 cup") without ever picking either extreme.
function pickCommonServingGrams(portions: UsdaFoodPortion[] | undefined): number | null {
  if (!portions || portions.length === 0) return null;
  const weights = portions.map((p) => p.gramWeight).filter((g): g is number => g > 0).sort((a, b) => a - b);
  if (weights.length === 0) return null;
  const mid = Math.floor(weights.length / 2);
  const median = weights.length % 2 !== 0 ? weights[mid] : (weights[mid - 1] + weights[mid]) / 2;
  return Math.round(median);
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
// hit computes nutrition identically to a live one. foodName drives the
// curated serving-size override for the narrow set of foods USDA itself
// doesn't portion realistically — see lib/usda/serving-overrides.ts.
export function buildMatchFromDetail(fdcId: string, detail: UsdaFoodDetail, foodName: string): UsdaFoodMatch {
  const macros = extractMacrosFromDetail(detail);
  const quantityGrams =
    findServingOverride(foodName)?.grams ?? pickCommonServingGrams(detail.foodPortions) ?? DEFAULT_SERVING_GRAMS;

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

  const best = pickBestMatch(candidates, foodName, preparation);
  if (!best) return null;

  const detail = await usdaFetch<UsdaFoodDetail>(`${FOOD_URL}/${best.fdcId}`, {});
  return buildMatchFromDetail(String(best.fdcId), detail, foodName);
}
