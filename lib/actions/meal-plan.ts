"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { anthropic } from "@/lib/anthropic/client";
import { getLatestCompletedBiomarkers } from "@/lib/actions/blood-reports";
import { needsPreferencesGate } from "@/lib/meal-plan/preference-options";
import {
  buildMatchFromDetail,
  searchFood,
  UsdaRateLimitError,
  type UsdaFoodDetail,
  type UsdaFoodMatch,
} from "@/lib/usda/client";
import {
  MEAL_PLAN_FOOD_CATEGORIES,
  MEAL_TYPE_ORDER,
  type MealPlanFoodCategory,
  type MealPlanFoodPreparation,
  type MealPlanWithFoods,
  type MealType,
} from "@/lib/types/meal-plan";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Categories that read as "prepared" by default (meat, grains) vs.
// "as-is" by default (produce, dairy) when Claude doesn't specify a
// preparation for a proposed food.
const DEFAULT_COOKED_CATEGORIES = new Set<MealPlanFoodCategory>(["protein", "carb"]);

function defaultPreparation(category: MealPlanFoodCategory): MealPlanFoodPreparation {
  return DEFAULT_COOKED_CATEGORIES.has(category) ? "cooked" : "raw";
}

const PROPOSAL_SCHEMA = {
  type: "object",
  properties: {
    rationale: {
      type: "string",
      description: "One short paragraph explaining the overall shape of this food list.",
    },
    foods: {
      type: "array",
      items: {
        type: "object",
        properties: {
          food_name: { type: "string" },
          category: { type: "string", enum: MEAL_PLAN_FOOD_CATEGORIES },
          meal_type: { type: "string", enum: MEAL_TYPE_ORDER },
          preparation: { anyOf: [{ type: "string", enum: ["raw", "cooked"] }, { type: "null" }] },
          rationale: { type: "string" },
        },
        required: ["food_name", "category", "meal_type", "preparation", "rationale"],
        additionalProperties: false,
      },
    },
  },
  required: ["rationale", "foods"],
  additionalProperties: false,
} as const;

const PROPOSAL_SYSTEM_PROMPT = `You are a nutrition-minded assistant helping a user build a personalized food list based on their blood biomarkers, wearable recovery data, and stated goals.

You must propose WHICH foods make sense — never nutrition numbers. Do not output calories, grams, macros, or any quantity. A separate, real food-database lookup supplies all numeric nutrition data after you respond. Your schema has no fields for numbers because you must never invent them.

The user message includes a "HARD CONSTRAINTS" section (diet and allergies), a "PERSISTENT FOOD PREFERENCES" section (foods the user has permanently excluded or prefers, carried over from past plans), and a "GUIDANCE" section (biomarkers, wearable data, goals, activity level). These are not the same kind of instruction:

- HARD CONSTRAINTS are absolute and safety-critical, especially allergies. Before including any food, check it against every listed allergen — including obvious derivatives and hidden forms (e.g. a dairy allergy excludes milk, cheese, butter, whey, and casein; a peanut allergy excludes peanut oil and peanut butter). If a food is even plausibly derived from an allergen, leave it out. The diet constraint is equally strict: if the user's diet is vegetarian, vegan, or another restricted diet, do not propose meat, fish, or any food outside that diet, no matter how well it would otherwise fit a biomarker or goal.
- PERSISTENT FOOD PREFERENCES: any food listed as permanently excluded must be treated as strictly as an allergy — never propose it or an obvious variant of it. This is a separate signal from allergies (it reflects a dislike or a past rejection, not a safety issue), so never describe an excluded food as an allergen in your rationale. Foods listed as preferred should be included when they reasonably fit everything else, but this is a soft preference, not a requirement.
- GUIDANCE should shape your choices but never override a hard constraint or a permanent exclusion. Never satisfy a biomarker or goal by violating diet, allergies, or a permanent exclusion — always find an alternative food that respects all of them.

For each food:
- food_name: a generic, commonly-searchable food name (e.g. "chicken breast", "rolled oats", "spinach") — not a brand or a prepared dish.
- category: one of protein, carb, vegetable, fruit, dairy, other.
- meal_type: one of breakfast, lunch, dinner, snack — whichever slot this food would realistically be eaten in.
- preparation: "raw" or "cooked" if it meaningfully affects the food (e.g. chicken should be "cooked", spinach can be "raw"), or null if it doesn't apply (e.g. a fruit usually eaten as-is).
- rationale: one plain-English sentence tied to a SPECIFIC biomarker, wearable metric, or stated goal from the GUIDANCE section — not generic health advice. If the user has no biomarker/wearable data yet, tie the rationale to their stated profile goals instead.

Propose 15 to 20 foods, spanning multiple categories and all four meal types, that together form a sensible everyday food list.`;

function buildSwapSystemPrompt(mealType: MealType): string {
  return `You are a nutrition-minded assistant helping a user replace the foods in ONE meal slot (${mealType}) of their existing food list, based on their blood biomarkers, wearable recovery data, stated goals, and food preferences.

You must propose WHICH foods make sense for ${mealType} specifically — never nutrition numbers. Do not output calories, grams, macros, or any quantity. A separate, real food-database lookup supplies all numeric nutrition data after you respond. Your schema has no fields for numbers because you must never invent them.

The user message includes a "HARD CONSTRAINTS" section (diet and allergies), a "PERSISTENT FOOD PREFERENCES" section (foods the user has permanently excluded or prefers), a "GUIDANCE" section (biomarkers, wearable data, goals, activity level), and a list of foods already in the rest of this plan. These are not the same kind of instruction:

- HARD CONSTRAINTS are absolute and safety-critical, especially allergies. Before including any food, check it against every listed allergen — including obvious derivatives and hidden forms. The diet constraint is equally strict: never propose a food outside the user's stated diet.
- PERSISTENT FOOD PREFERENCES: any food listed as permanently excluded must be treated as strictly as an allergy — never propose it or an obvious variant of it. Foods listed as preferred should be included when they reasonably fit everything else, but this is a soft preference.
- GUIDANCE should shape your choices but never override a hard constraint or a permanent exclusion.
- Avoid proposing a food that's already listed elsewhere in this plan — pick different foods for ${mealType}.

For each food:
- food_name: a generic, commonly-searchable food name (e.g. "chicken breast", "rolled oats", "spinach") — not a brand or a prepared dish.
- category: one of protein, carb, vegetable, fruit, dairy, other.
- preparation: "raw" or "cooked" if it meaningfully affects the food, or null if it doesn't apply.
- rationale: one plain-English sentence tied to a SPECIFIC biomarker, wearable metric, or stated goal — not generic health advice.

Propose 3 to 6 foods suitable specifically for ${mealType}.`;
}

const SWAP_SCHEMA = {
  type: "object",
  properties: {
    foods: {
      type: "array",
      items: {
        type: "object",
        properties: {
          food_name: { type: "string" },
          category: { type: "string", enum: MEAL_PLAN_FOOD_CATEGORIES },
          preparation: { anyOf: [{ type: "string", enum: ["raw", "cooked"] }, { type: "null" }] },
          rationale: { type: "string" },
        },
        required: ["food_name", "category", "preparation", "rationale"],
        additionalProperties: false,
      },
    },
  },
  required: ["foods"],
  additionalProperties: false,
} as const;

export interface MealPlanContext {
  hasBiomarkers: boolean;
  outOfRangeBiomarkers: Array<{
    name: string;
    value: number | null;
    unit: string | null;
    flag: string | null;
    reference_range_low: number | null;
    reference_range_high: number | null;
  }>;
  normalBiomarkerCount: number;
  hasWearableData: boolean;
  wearableAverages: {
    sleepScore: number | null;
    readinessScore: number | null;
    activityScore: number | null;
    restingHeartRate: number | null;
    hrvAvg: number | null;
  } | null;
  profile: {
    name: string | null;
    dietaryPreferences: string[];
    fitnessGoals: string[];
    activityLevel: string | null;
    healthConditions: string[];
    allergies: string[];
  };
  foodPreferences: {
    excluded: string[];
    preferred: string[];
  };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

export async function getMealPlanContext(): Promise<MealPlanContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      hasBiomarkers: false,
      outOfRangeBiomarkers: [],
      normalBiomarkerCount: 0,
      hasWearableData: false,
      wearableAverages: null,
      profile: {
        name: null,
        dietaryPreferences: [],
        fitnessGoals: [],
        activityLevel: null,
        healthConditions: [],
        allergies: [],
      },
      foodPreferences: { excluded: [], preferred: [] },
    };
  }

  const biomarkers = await getLatestCompletedBiomarkers();
  const outOfRange = biomarkers.filter((b) => b.flag && b.flag !== "normal");

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { data: wearableRows } = await supabase
    .from("wearable_daily_data")
    .select("sleep_score, readiness_score, activity_score, resting_heart_rate, hrv_avg")
    .eq("user_id", user.id)
    .gte("date", sevenDaysAgo.toISOString().slice(0, 10));

  const rows = wearableRows ?? [];
  const avgField = (key: keyof (typeof rows)[number]): number | null =>
    average(rows.map((r) => r[key]).filter((v): v is number => v !== null));

  const wearableAverages =
    rows.length > 0
      ? {
          sleepScore: avgField("sleep_score"),
          readinessScore: avgField("readiness_score"),
          activityScore: avgField("activity_score"),
          restingHeartRate: avgField("resting_heart_rate"),
          hrvAvg: avgField("hrv_avg"),
        }
      : null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("name, dietary_preferences, fitness_goals, activity_level, health_conditions, allergies")
    .eq("id", user.id)
    .maybeSingle();

  const { data: preferenceRows } = await supabase
    .from("food_preferences")
    .select("food_name, preference")
    .eq("user_id", user.id);

  const foodPreferences = {
    excluded: (preferenceRows ?? []).filter((r) => r.preference === "excluded").map((r) => r.food_name),
    preferred: (preferenceRows ?? []).filter((r) => r.preference === "preferred").map((r) => r.food_name),
  };

  return {
    hasBiomarkers: biomarkers.length > 0,
    outOfRangeBiomarkers: outOfRange.map((b) => ({
      name: b.name,
      value: b.value,
      unit: b.unit,
      flag: b.flag,
      reference_range_low: b.reference_range_low,
      reference_range_high: b.reference_range_high,
    })),
    normalBiomarkerCount: biomarkers.length - outOfRange.length,
    hasWearableData: rows.length > 0,
    wearableAverages,
    profile: {
      name: profile?.name ?? null,
      dietaryPreferences: profile?.dietary_preferences ?? [],
      fitnessGoals: profile?.fitness_goals ?? [],
      activityLevel: profile?.activity_level ?? null,
      healthConditions: profile?.health_conditions ?? [],
      allergies: profile?.allergies ?? [],
    },
    foodPreferences,
  };
}

function buildContextBlock(context: MealPlanContext): string {
  const p = context.profile;
  const hardConstraints: string[] = [
    `Diet: strictly ${p.dietaryPreferences.length > 0 ? p.dietaryPreferences.join(" + ") : "no restriction stated"}. Never propose a food outside this diet.`,
    `Allergies: ${p.allergies.length > 0 ? p.allergies.join(", ") : "none reported"}. Never propose a food containing, made from, or derived from any of these — including hidden/derivative forms.`,
  ];

  const lines: string[] = ["HARD CONSTRAINTS (absolute — never violate):", ...hardConstraints.map((l) => `- ${l}`)];

  const fp = context.foodPreferences;
  if (fp.excluded.length > 0 || fp.preferred.length > 0) {
    lines.push(
      "",
      "PERSISTENT FOOD PREFERENCES (a separate signal from allergies — carried over from past plans):"
    );
    if (fp.excluded.length > 0) {
      lines.push(`- Permanently excluded, treat as strictly as an allergy: ${fp.excluded.join(", ")}.`);
    }
    if (fp.preferred.length > 0) {
      lines.push(`- Preferred, include when they fit the other constraints: ${fp.preferred.join(", ")}.`);
    }
  }

  lines.push("", "GUIDANCE (shapes choices, never overrides the constraints above):");

  if (context.hasBiomarkers) {
    lines.push(`Blood biomarkers: ${context.normalBiomarkerCount} within normal range.`);
    if (context.outOfRangeBiomarkers.length > 0) {
      lines.push("Out-of-range biomarkers:");
      for (const b of context.outOfRangeBiomarkers) {
        const range =
          b.reference_range_low !== null && b.reference_range_high !== null
            ? ` (reference ${b.reference_range_low}-${b.reference_range_high}${b.unit ?? ""})`
            : "";
        lines.push(`- ${b.name}: ${b.value}${b.unit ?? ""} — flagged ${b.flag}${range}`);
      }
    } else {
      lines.push("No out-of-range biomarkers.");
    }
  } else {
    lines.push("No blood report uploaded yet — work only from the profile info below.");
  }

  if (context.hasWearableData && context.wearableAverages) {
    const w = context.wearableAverages;
    lines.push(
      `Wearable data (last 7 days average): sleep score ${w.sleepScore ?? "n/a"}, readiness score ${w.readinessScore ?? "n/a"}, activity score ${w.activityScore ?? "n/a"}, resting heart rate ${w.restingHeartRate ?? "n/a"} bpm, HRV ${w.hrvAvg ?? "n/a"} ms.`
    );
  } else {
    lines.push("No wearable data available.");
  }

  lines.push(
    `Fitness goals: ${p.fitnessGoals.length > 0 ? p.fitnessGoals.join(", ") : "not yet provided"}.`
  );
  lines.push(`Activity level: ${p.activityLevel ?? "not yet provided"}.`);
  lines.push(
    `Health conditions: ${p.healthConditions.length > 0 ? p.healthConditions.join(", ") : "none provided"}.`
  );

  return lines.join("\n");
}

interface ProposedFoodBase {
  food_name: string;
  category: MealPlanFoodCategory;
  preparation: MealPlanFoodPreparation | null;
  rationale: string;
}

interface ProposedFood extends ProposedFoodBase {
  meal_type: MealType;
}

interface ProposalPayload {
  rationale: string;
  foods: ProposedFood[];
}

interface SwapProposalPayload {
  foods: ProposedFoodBase[];
}

// Naive singularization so a plural term ("peanuts") still catches a
// singular derivative food name ("peanut butter") — a plain substring
// check misses this because "peanuts" isn't a substring of "peanut
// butter". Deliberately simple: strips a trailing "s" ("nuts" -> "nut"),
// not a full stemmer.
function singularize(word: string): string {
  if (word.endsWith("ies") && word.length > 3) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 1) return word.slice(0, -1);
  return word;
}

// Defense-in-depth on top of the strict prompt wording: used for both
// allergies and permanently-excluded food preferences, which are safety-
// or persistence-critical exclusions the model shouldn't be trusted to
// enforce on its own. A literal name match is caught here even if the
// prompt is ever ignored. A plain substring/word check can occasionally
// over-match (e.g. "milk" flags "coconut milk" for a dairy allergy, or
// "eggs" flags "eggplant") — acceptable since a false exclusion is far
// safer here than a false inclusion. Callers keep allergy and preference
// matches in separate result lists — this function has no opinion on why
// a term is being excluded.
function matchedInList(foodName: string, terms: string[]): string | null {
  const normalizedFood = foodName.toLowerCase();
  return (
    terms.find((term) => {
      const normalized = term.toLowerCase().trim();
      if (!normalized) return false;
      return normalizedFood.includes(normalized) || normalizedFood.includes(singularize(normalized));
    }) ?? null
  );
}

function normalizeSearchKey(foodName: string, preparation: MealPlanFoodPreparation): string {
  return `${foodName.trim().toLowerCase()}::${preparation}`;
}

async function lookupWithCache(
  supabase: SupabaseServerClient,
  foodName: string,
  preparation: MealPlanFoodPreparation
): Promise<UsdaFoodMatch | null> {
  const searchKey = normalizeSearchKey(foodName, preparation);

  const { data: cached } = await supabase
    .from("food_reference")
    .select("usda_fdc_id, raw_json")
    .eq("search_key", searchKey)
    .maybeSingle();

  if (cached) {
    return buildMatchFromDetail(cached.usda_fdc_id, cached.raw_json as UsdaFoodDetail);
  }

  const match = await searchFood(foodName, preparation);
  if (!match) return null;

  await supabase.from("food_reference").upsert(
    {
      search_key: searchKey,
      usda_fdc_id: match.fdcId,
      food_name: foodName,
      raw_json: match.raw as object,
    },
    { onConflict: "search_key" }
  );

  return match;
}

// Batch read for the food resolution loop: one query for every food's
// cache status instead of one query per food. Callers still fall back to
// searchFood (a real USDA call) per miss, sequentially, so the rate-limit
// stop behavior below is unaffected.
async function getCachedMatches(
  supabase: SupabaseServerClient,
  searchKeys: string[]
): Promise<Map<string, UsdaFoodMatch>> {
  if (searchKeys.length === 0) return new Map();

  const { data } = await supabase
    .from("food_reference")
    .select("search_key, usda_fdc_id, raw_json")
    .in("search_key", searchKeys);

  const matches = new Map<string, UsdaFoodMatch>();
  for (const row of data ?? []) {
    matches.set(row.search_key, buildMatchFromDetail(row.usda_fdc_id, row.raw_json as UsdaFoodDetail));
  }
  return matches;
}

interface ResolvableFood extends ProposedFoodBase {
  meal_type: MealType;
}

// Shared by full generation and per-meal swap: resolves each proposed
// food against the USDA cache/API, then inserts the resulting rows into
// meal_plan_foods. Throws on a DB insert failure so callers can surface
// their own user-facing error message.
async function resolveAndInsertFoods(
  supabase: SupabaseServerClient,
  userId: string,
  mealPlanId: string,
  foods: ResolvableFood[],
  logLabel: string
): Promise<{ skippedFoods: string[] }> {
  if (foods.length === 0) return { skippedFoods: [] };

  const preparations = foods.map((food) => food.preparation ?? defaultPreparation(food.category));
  const searchKeys = foods.map((food, i) => normalizeSearchKey(food.food_name, preparations[i]));
  const cachedMatches = await getCachedMatches(supabase, searchKeys);

  const skippedFoods: string[] = [];
  const rows: Array<Record<string, unknown>> = [];
  const newCacheRows = new Map<string, Record<string, unknown>>();
  let rateLimited = false;

  for (let i = 0; i < foods.length; i++) {
    const food = foods[i];
    const preparation = preparations[i];
    const searchKey = searchKeys[i];

    if (rateLimited) {
      skippedFoods.push(food.food_name);
      continue;
    }

    try {
      let match = cachedMatches.get(searchKey) ?? null;
      if (!match) {
        match = await searchFood(food.food_name, preparation);
        if (match) {
          newCacheRows.set(searchKey, {
            search_key: searchKey,
            usda_fdc_id: match.fdcId,
            food_name: food.food_name,
            raw_json: match.raw as object,
          });
        }
      }

      if (!match) {
        skippedFoods.push(food.food_name);
        continue;
      }

      rows.push({
        meal_plan_id: mealPlanId,
        food_name: food.food_name,
        usda_fdc_id: match.fdcId,
        quantity_grams: match.quantityGrams,
        preparation,
        calories: match.calories,
        protein_g: match.proteinG,
        carbs_g: match.carbsG,
        fat_g: match.fatG,
        category: food.category,
        meal_type: food.meal_type,
        rationale: food.rationale,
        status: "proposed",
        is_user_added: false,
      });
    } catch (err) {
      if (err instanceof UsdaRateLimitError) {
        console.error(`[meal-plan ${userId}] USDA rate limit hit — stopping lookups for this batch (${logLabel}).`);
        rateLimited = true;
        skippedFoods.push(food.food_name);
        continue;
      }
      console.error(`[meal-plan ${userId}] USDA lookup failed for "${food.food_name}" (${logLabel}):`, err);
      skippedFoods.push(food.food_name);
    }
  }

  if (newCacheRows.size > 0) {
    await supabase.from("food_reference").upsert([...newCacheRows.values()], { onConflict: "search_key" });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("meal_plan_foods").insert(rows);
    if (error) {
      console.error(`[meal-plan ${userId}] food rows insert failed (${logLabel}):`, error.message);
      throw new Error("insert failed");
    }
  }

  return { skippedFoods };
}

export interface GenerateMealPlanResult {
  success: boolean;
  error: string | null;
  skippedFoods: string[];
  excludedForAllergy: string[];
  excludedForPreference: string[];
}

function fail(
  error: string,
  excludedForAllergy: string[] = [],
  excludedForPreference: string[] = []
): GenerateMealPlanResult {
  return { success: false, error, skippedFoods: [], excludedForAllergy, excludedForPreference };
}

export async function generateMealPlan(): Promise<GenerateMealPlanResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail("Not authenticated.");
  }

  const context = await getMealPlanContext();
  if (needsPreferencesGate(context.profile)) {
    return fail("Set your dietary preferences and goal before generating a meal plan.");
  }
  const contextBlock = buildContextBlock(context);

  let payload: ProposalPayload;
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4000,
      system: PROPOSAL_SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: PROPOSAL_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: `Here is what's known about this user:\n\n${contextBlock}\n\nPropose a food list.`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new Error("Claude declined to generate a food list.");
    }

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error(`No text content in Claude's response (stop_reason: ${response.stop_reason}).`);
    }

    payload = JSON.parse(textBlock.text) as ProposalPayload;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    console.error(`[meal-plan ${user.id}] proposal generation failed:`, message);
    return fail("Couldn't generate a food list right now. Please try again in a moment.");
  }

  if (payload.foods.length === 0) {
    return fail("The AI didn't propose any foods. Please try again.");
  }

  // Safety net on top of the prompt's hard-constraint wording — drop any
  // proposed food whose name literally matches a reported allergen before
  // it ever reaches a USDA lookup or gets saved.
  const excludedForAllergy: string[] = [];
  const safeFoods = payload.foods.filter((food) => {
    const allergen = matchedInList(food.food_name, context.profile.allergies);
    if (allergen) {
      console.error(
        `[meal-plan ${user.id}] excluded "${food.food_name}" — matched allergen "${allergen}".`
      );
      excludedForAllergy.push(food.food_name);
      return false;
    }
    return true;
  });

  if (safeFoods.length === 0) {
    return fail("Every proposed food conflicted with your allergies. Please try regenerating.", excludedForAllergy);
  }

  // Same defense-in-depth, run separately for the persistent "don't
  // suggest this again" signal — kept distinct from the allergy result so
  // messaging never conflates a dislike with a safety exclusion.
  const excludedForPreference: string[] = [];
  const finalFoods = safeFoods.filter((food) => {
    const excludedTerm = matchedInList(food.food_name, context.foodPreferences.excluded);
    if (excludedTerm) {
      excludedForPreference.push(food.food_name);
      return false;
    }
    return true;
  });

  if (finalFoods.length === 0) {
    return fail(
      "Every proposed food conflicted with your allergies or excluded preferences. Please try regenerating.",
      excludedForAllergy,
      excludedForPreference
    );
  }

  // Only one non-archived plan at a time in Phase 1 — regenerating
  // archives whatever draft/active plan already exists.
  await supabase
    .from("meal_plans")
    .update({ status: "archived" })
    .eq("user_id", user.id)
    .in("status", ["draft", "active"]);

  const { data: newPlan, error: planError } = await supabase
    .from("meal_plans")
    .insert({ user_id: user.id, status: "draft", ai_rationale: payload.rationale })
    .select("id")
    .single();

  if (planError || !newPlan) {
    console.error(`[meal-plan ${user.id}] plan insert failed:`, planError?.message);
    return fail("Couldn't save your meal plan. Please try again.", excludedForAllergy, excludedForPreference);
  }

  let resolved: { skippedFoods: string[] };
  try {
    resolved = await resolveAndInsertFoods(supabase, user.id, newPlan.id, finalFoods, "generate");
  } catch {
    return fail("Couldn't save your food list. Please try again.", excludedForAllergy, excludedForPreference);
  }

  revalidatePath("/meal-plan");

  return { success: true, error: null, skippedFoods: resolved.skippedFoods, excludedForAllergy, excludedForPreference };
}

export interface SwapMealResult {
  success: boolean;
  error: string | null;
  skippedFoods: string[];
  excludedForAllergy: string[];
  excludedForPreference: string[];
}

function failSwap(
  error: string,
  excludedForAllergy: string[] = [],
  excludedForPreference: string[] = []
): SwapMealResult {
  return { success: false, error, skippedFoods: [], excludedForAllergy, excludedForPreference };
}

export async function swapMealType(mealPlanId: string, mealType: MealType): Promise<SwapMealResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return failSwap("Not authenticated.");
  }

  const { data: plan } = await supabase
    .from("meal_plans")
    .select("id")
    .eq("id", mealPlanId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plan) {
    return failSwap("Meal plan not found.");
  }

  const context = await getMealPlanContext();
  const contextBlock = buildContextBlock(context);

  const { data: existingFoods } = await supabase
    .from("meal_plan_foods")
    .select("food_name, meal_type, status")
    .eq("meal_plan_id", mealPlanId)
    .neq("status", "rejected");

  const otherFoods = (existingFoods ?? [])
    .filter((f) => f.meal_type !== mealType)
    .map((f) => f.food_name);
  const existingBlock =
    otherFoods.length > 0
      ? `Foods already in this plan for other meals (avoid proposing duplicates): ${otherFoods.join(", ")}.`
      : "No other foods in this plan yet.";

  let payload: SwapProposalPayload;
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      system: buildSwapSystemPrompt(mealType),
      output_config: {
        format: { type: "json_schema", schema: SWAP_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: `Here is what's known about this user:\n\n${contextBlock}\n\n${existingBlock}\n\nPropose replacement foods for ${mealType}.`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new Error("Claude declined to generate replacement foods.");
    }

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error(`No text content in Claude's response (stop_reason: ${response.stop_reason}).`);
    }

    payload = JSON.parse(textBlock.text) as SwapProposalPayload;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    console.error(`[meal-plan ${user.id}] swap generation failed:`, message);
    return failSwap("Couldn't swap this meal right now. Please try again in a moment.");
  }

  if (payload.foods.length === 0) {
    return failSwap("The AI didn't propose any replacement foods. Please try again.");
  }

  const excludedForAllergy: string[] = [];
  const safeFoods = payload.foods.filter((food) => {
    const allergen = matchedInList(food.food_name, context.profile.allergies);
    if (allergen) {
      excludedForAllergy.push(food.food_name);
      return false;
    }
    return true;
  });

  const excludedForPreference: string[] = [];
  const finalFoods = safeFoods.filter((food) => {
    const excludedTerm = matchedInList(food.food_name, context.foodPreferences.excluded);
    if (excludedTerm) {
      excludedForPreference.push(food.food_name);
      return false;
    }
    return true;
  });

  if (finalFoods.length === 0) {
    return failSwap(
      "Every replacement conflicted with your allergies or excluded preferences. Please try again.",
      excludedForAllergy,
      excludedForPreference
    );
  }

  // Only clear the AI-proposed foods for this slot — foods the user typed
  // in themselves (is_user_added) are deliberate and stay put.
  const { error: deleteError } = await supabase
    .from("meal_plan_foods")
    .delete()
    .eq("meal_plan_id", mealPlanId)
    .eq("meal_type", mealType)
    .eq("is_user_added", false);

  if (deleteError) {
    console.error(`[meal-plan ${user.id}] swap delete failed:`, deleteError.message);
    return failSwap("Couldn't swap this meal right now. Please try again.", excludedForAllergy, excludedForPreference);
  }

  const resolvableFoods: ResolvableFood[] = finalFoods.map((food) => ({ ...food, meal_type: mealType }));

  let resolved: { skippedFoods: string[] };
  try {
    resolved = await resolveAndInsertFoods(supabase, user.id, mealPlanId, resolvableFoods, `swap:${mealType}`);
  } catch {
    return failSwap("Couldn't save your replacement foods. Please try again.", excludedForAllergy, excludedForPreference);
  }

  revalidatePath("/meal-plan");

  return {
    success: true,
    error: null,
    skippedFoods: resolved.skippedFoods,
    excludedForAllergy,
    excludedForPreference,
  };
}

export async function getCurrentMealPlan(): Promise<MealPlanWithFoods | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("meal_plans")
    .select("*, meal_plan_foods(*)")
    .eq("user_id", user.id)
    .in("status", ["draft", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch meal plan:", error.message);
    return null;
  }

  return (data as MealPlanWithFoods | null) ?? null;
}

export async function updateFoodStatus(foodId: string, status: "accepted" | "rejected"): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from("meal_plan_foods").update({ status }).eq("id", foodId);
  if (error) {
    console.error(`Failed to update food ${foodId} status:`, error.message);
    return;
  }

  revalidatePath("/meal-plan");
}

export interface AddFoodState {
  error: string | null;
}

export async function addUserFood(_prevState: AddFoodState, formData: FormData): Promise<AddFoodState> {
  const mealPlanId = formData.get("mealPlanId") as string | null;
  const foodName = (formData.get("foodName") as string | null)?.trim();
  const mealTypeRaw = formData.get("mealType") as string | null;
  const mealType: MealType = MEAL_TYPE_ORDER.includes(mealTypeRaw as MealType)
    ? (mealTypeRaw as MealType)
    : "snack";

  if (!mealPlanId || !foodName) {
    return { error: "Enter a food name first." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated." };
  }

  const { data: profileRow } = await supabase
    .from("user_profiles")
    .select("allergies")
    .eq("id", user.id)
    .maybeSingle();

  const allergen = matchedInList(foodName, profileRow?.allergies ?? []);
  if (allergen) {
    return { error: `"${foodName}" conflicts with your allergy to ${allergen}.` };
  }

  try {
    let preparation: MealPlanFoodPreparation = "raw";
    let resolvedMatch = await lookupWithCache(supabase, foodName, preparation);
    if (!resolvedMatch) {
      preparation = "cooked";
      resolvedMatch = await lookupWithCache(supabase, foodName, preparation);
    }

    if (!resolvedMatch) {
      return { error: `Couldn't find nutrition data for "${foodName}". Try a more generic name.` };
    }

    const { error } = await supabase.from("meal_plan_foods").insert({
      meal_plan_id: mealPlanId,
      food_name: foodName,
      usda_fdc_id: resolvedMatch.fdcId,
      quantity_grams: resolvedMatch.quantityGrams,
      preparation,
      calories: resolvedMatch.calories,
      protein_g: resolvedMatch.proteinG,
      carbs_g: resolvedMatch.carbsG,
      fat_g: resolvedMatch.fatG,
      category: "other",
      meal_type: mealType,
      rationale: null,
      status: "accepted",
      is_user_added: true,
    });

    if (error) {
      console.error(`[meal-plan ${user.id}] add food failed:`, error.message);
      return { error: "Couldn't add that food. Please try again." };
    }
  } catch (err) {
    if (err instanceof UsdaRateLimitError) {
      return { error: "Nutrition lookups are rate-limited right now — try again shortly." };
    }
    console.error(`[meal-plan ${user.id}] add food lookup failed:`, err);
    return { error: "Couldn't look up that food right now. Please try again." };
  }

  revalidatePath("/meal-plan");
  return { error: null };
}
