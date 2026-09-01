// Server-only USDA FoodData Central client. Never imported from a client
// component. Supplies the real nutrition numbers for AI-proposed foods —
// Claude names WHICH foods make sense, this looks up the actual grams/
// calories/macros, matching how blood-report numbers are never trusted
// from raw AI output without a grounding source.
import type { MealPlanFoodPreparation } from "@/lib/types/meal-plan";
import { findServingOverride } from "@/lib/usda/serving-overrides";
import { findNutritionFallback } from "@/lib/usda/nutrition-fallbacks";

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
// caloriesFallback: Foundation Foods entries frequently omit "208 Energy"
// entirely and report it only under 957 ("Energy, Atwater General
// Factors") — seen on otherwise-complete records (chia seeds, almond
// butter, apple) that still have protein/fat/carbs, so it's checked as a
// general fallback rather than per-food.
const NUTRIENT_NUMBERS = {
  calories: "208",
  caloriesFallback: "957",
  protein: "203",
  fat: "204",
  carbs: "205",
} as const;

// USDA describes each result as "Head, qualifier, qualifier, ..." (e.g.
// "Broccoli, cooked, boiled, drained, with salt"), sometimes with a
// parenthetical alt-name fused onto the head (e.g. "Chickpeas (garbanzo
// beans, bengal gram), mature seeds, cooked..."). But for a fixed set of
// categories USDA inverts this to "Category, Head, qualifier, ..." (e.g.
// "Spices, cinnamon, ground", "Seeds, sesame seeds, whole, dried") — so
// the food's own name can land in either the first or second
// comma-separated segment depending on which convention this particular
// record happens to use. Strip the parenthetical before splitting so an
// embedded comma doesn't get mistaken for a segment boundary.
function descriptionSegments(description: string): string[] {
  const stripped = description.replace(/\([^)]*\)/g, " ").replace(/\s{2,}/g, " ").trim();
  return stripped.split(",").map((s) => s.trim().toLowerCase());
}

// USDA's head noun is usually plural ("Apples", "Chickpeas") while an
// AI-proposed food name is often singular ("apple") — strip a trailing
// "s" from both sides so that difference alone doesn't break an exact
// match.
function stripTrailingS(s: string): string {
  return s.endsWith("s") && s.length > 1 ? s.slice(0, -1) : s;
}

// USDA category nouns known to invert naming to "Category, FoodName,
// qualifier..." (e.g. "Spices, cinnamon, ground", "Seeds, hemp seed,
// hulled", "Oil, olive, extra virgin", "Nuts, almond butter, plain, with
// salt added"). Only trust a match on the SECOND segment when the first
// is one of these — otherwise "Bread, cinnamon" (a dish, not the spice)
// would falsely equal a search for "cinnamon" via the same rule, since
// USDA also uses "Category, flavor-descriptor" for dish names.
const INVERTED_CATEGORY_HEADS = new Set(["seeds", "spices", "spice", "oil", "oils", "nuts"]);

// Whether this candidate's own name (checked in either of USDA's two
// naming conventions above) exactly equals the requested food — the only
// signal trustworthy enough to also drive the preparation-word tiebreak.
function isExactNameMatch(description: string, nameNorm: string): boolean {
  const target = stripTrailingS(nameNorm);
  const [head, second] = descriptionSegments(description);
  if (stripTrailingS(head ?? "") === target) return true;
  if (INVERTED_CATEGORY_HEADS.has(head ?? "") && stripTrailingS(second ?? "") === target) return true;
  return false;
}

interface RankedMatch {
  food: UsdaSearchFoodItem;
  // Whether this pick is trustworthy enough to (a) drive the preparation
  // tiebreak and (b) skip the no-preparation retry in searchFood. False
  // means "best guess from a weak pool" — see historical note below.
  confident: boolean;
}

// Picking a match by preparation word alone is unsafe: a candidate can
// contain "raw" or "cooked" purely by coincidence while being a
// completely different food (searching "ground flaxseed raw" once
// matched "Bison, ground, raw" — wrong species entirely — ahead of the
// correctly-ranked "Flaxseed, ground", because flaxseed's own USDA name
// has no raw/cooked qualifier at all; the same failure mode later picked
// "breadfruit seeds, raw" for a search for "sesame seeds"). So candidates
// are ranked in tiers of trust, and the preparation word is only ever
// used to choose among the highest tier — never to rescue a weak pool.
function pickBestMatch(
  foods: UsdaSearchFoodItem[],
  foodName: string,
  preparation: MealPlanFoodPreparation | null
): RankedMatch | null {
  if (foods.length === 0) return null;

  const nameNorm = foodName.trim().toLowerCase();
  const nameWords = nameNorm.split(/\s+/).filter(Boolean);
  const firstWord = nameWords[0] ?? nameNorm;
  const lastWord = nameWords[nameWords.length - 1] ?? nameNorm;
  const containsWord = (food: UsdaSearchFoodItem, word: string) => {
    const desc = food.description.toLowerCase();
    return desc.includes(word) || desc.includes(stripTrailingS(word));
  };

  // Tier A: the candidate's own name exactly matches the requested food —
  // highest confidence, and the only tier where the preparation word is
  // trusted to break a tie between otherwise-equal candidates.
  const exact = foods.filter((food) => isExactNameMatch(food.description, nameNorm));
  if (exact.length > 0) {
    if (preparation) {
      const prepMatch = exact.find((food) => food.description.toLowerCase().includes(preparation));
      if (prepMatch) return { food: prepMatch, confident: true };
    }
    // Prefer the plainest (shortest) description among remaining ties —
    // e.g. "Butter, salted" over "Butter, Clarified butter (ghee)".
    const plainest = [...exact].sort((a, b) => a.description.length - b.description.length)[0];
    return { food: plainest, confident: true };
  }

  // Tier B: candidates sharing the food name's FIRST word, when that
  // meaningfully narrows the pool. Only applies to multi-word names — for
  // a single-word name, "first word" and "last word" are the same word,
  // which collapses to the same weak substring match that causes the
  // wrong-food picks this function exists to avoid (e.g. "butter" would
  // "confidently" match "Seeds, sesame butter, tahini..." on this alone).
  // The first word is usually the discriminating one in AI-proposed
  // compound names ("hemp seeds", "hemp hearts", "sesame seeds", "peanut
  // butter") since the last word is typically just the generic form
  // (seeds/butter/hearts) shared across many unrelated USDA entries.
  if (nameWords.length > 1) {
    const firstMatches = foods.filter((food) => containsWord(food, firstWord));
    if (firstMatches.length > 0 && firstMatches.length < foods.length) {
      return { food: firstMatches[0], confident: true };
    }
  }

  // Tier C/D: weak fallback — last-word pool, or the raw candidate list.
  // Never applies the preparation tiebreak here.
  const lastMatches = foods.filter((food) => containsWord(food, lastWord));
  const pool = lastMatches.length > 0 ? lastMatches : foods;
  return { food: pool[0], confident: false };
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
    caloriesPer100g: byNumber(NUTRIENT_NUMBERS.calories) ?? byNumber(NUTRIENT_NUMBERS.caloriesFallback),
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
  let macros = extractMacrosFromDetail(detail);
  if (
    macros.caloriesPer100g === null &&
    macros.proteinPer100g === null &&
    macros.carbsPer100g === null &&
    macros.fatPer100g === null
  ) {
    const fallback = findNutritionFallback(foodName);
    if (fallback) {
      macros = {
        caloriesPer100g: fallback.caloriesPer100g,
        proteinPer100g: fallback.proteinPer100g,
        carbsPer100g: fallback.carbsPer100g,
        fatPer100g: fallback.fatPer100g,
      };
    }
  }
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

  let best = pickBestMatch(candidates, foodName, preparation);

  // Appending the preparation word to the query can do more harm than
  // good: USDA doesn't use "raw"/"cooked" as a qualifier for many foods
  // (honey, spices, nut butters, seeds sold as dried/hulled), and forcing
  // it into the search text can push the real entry out of the results
  // entirely rather than just re-rank it (e.g. "honey raw" and
  // "cinnamon raw" both return the same five unrelated raw fruits, with
  // no honey/cinnamon entry anywhere in the results). When the first
  // attempt doesn't land a confident match, retry once without the
  // preparation word and prefer that result if it's confident. This never
  // changes an already-confident result — see pickBestMatch's tiers.
  if (preparation && (!best || !best.confident)) {
    const plainCandidates = await searchFoods(foodName, GENERIC_DATA_TYPES);
    if (plainCandidates.length > 0) {
      const plainBest = pickBestMatch(plainCandidates, foodName, preparation);
      if (plainBest && (plainBest.confident || !best)) {
        best = plainBest;
      }
    }
  }

  if (!best) return null;

  const detail = await usdaFetch<UsdaFoodDetail>(`${FOOD_URL}/${best.food.fdcId}`, {});
  return buildMatchFromDetail(String(best.food.fdcId), detail, foodName);
}
