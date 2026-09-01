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
  type MealPlanFoodCategory,
  type MealPlanFoodPreparation,
  type MealPlanWithFoods,
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
          preparation: { anyOf: [{ type: "string", enum: ["raw", "cooked"] }, { type: "null" }] },
          rationale: { type: "string" },
        },
        required: ["food_name", "category", "preparation", "rationale"],
        additionalProperties: false,
      },
    },
  },
  required: ["rationale", "foods"],
  additionalProperties: false,
} as const;

const PROPOSAL_SYSTEM_PROMPT = `You are a nutrition-minded assistant helping a user build a personalized food list based on their blood biomarkers, wearable recovery data, and stated goals.

You must propose WHICH foods make sense — never nutrition numbers. Do not output calories, grams, macros, or any quantity. A separate, real food-database lookup supplies all numeric nutrition data after you respond. Your schema has no fields for numbers because you must never invent them.

The user message includes a "HARD CONSTRAINTS" section (diet and allergies) and a "GUIDANCE" section (biomarkers, wearable data, goals, activity level). These are not the same kind of instruction:

- HARD CONSTRAINTS are absolute and safety-critical, especially allergies. Before including any food, check it against every listed allergen — including obvious derivatives and hidden forms (e.g. a dairy allergy excludes milk, cheese, butter, whey, and casein; a peanut allergy excludes peanut oil and peanut butter). If a food is even plausibly derived from an allergen, leave it out. The diet constraint is equally strict: if the user's diet is vegetarian, vegan, or another restricted diet, do not propose meat, fish, or any food outside that diet, no matter how well it would otherwise fit a biomarker or goal.
- GUIDANCE should shape your choices but never override a hard constraint. Never satisfy a biomarker or goal by violating a diet or allergy — always find an alternative food that respects both.

For each food:
- food_name: a generic, commonly-searchable food name (e.g. "chicken breast", "rolled oats", "spinach") — not a brand or a prepared dish.
- category: one of protein, carb, vegetable, fruit, dairy, other.
- preparation: "raw" or "cooked" if it meaningfully affects the food (e.g. chicken should be "cooked", spinach can be "raw"), or null if it doesn't apply (e.g. a fruit usually eaten as-is).
- rationale: one plain-English sentence tied to a SPECIFIC biomarker, wearable metric, or stated goal from the GUIDANCE section — not generic health advice. If the user has no biomarker/wearable data yet, tie the rationale to their stated profile goals instead.

Propose 15 to 20 foods, spanning multiple categories, that together form a sensible everyday food list — not a rigid meal-by-meal plan.`;

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
  };
}

function buildContextBlock(context: MealPlanContext): string {
  const p = context.profile;
  const hardConstraints: string[] = [
    `Diet: strictly ${p.dietaryPreferences.length > 0 ? p.dietaryPreferences.join(" + ") : "no restriction stated"}. Never propose a food outside this diet.`,
    `Allergies: ${p.allergies.length > 0 ? p.allergies.join(", ") : "none reported"}. Never propose a food containing, made from, or derived from any of these — including hidden/derivative forms.`,
  ];

  const lines: string[] = ["HARD CONSTRAINTS (absolute — never violate):", ...hardConstraints.map((l) => `- ${l}`), "", "GUIDANCE (shapes choices, never overrides the constraints above):"];

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

interface ProposedFood {
  food_name: string;
  category: MealPlanFoodCategory;
  preparation: MealPlanFoodPreparation | null;
  rationale: string;
}

interface ProposalPayload {
  rationale: string;
  foods: ProposedFood[];
}

// Naive singularization so a plural allergy ("peanuts") still catches a
// singular derivative food name ("peanut butter") — a plain substring
// check misses this because "peanuts" isn't a substring of "peanut
// butter". Deliberately simple: strips a trailing "s" ("nuts" -> "nut"),
// not a full stemmer.
function singularize(word: string): string {
  if (word.endsWith("ies") && word.length > 3) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 1) return word.slice(0, -1);
  return word;
}

// Defense-in-depth on top of the strict prompt wording: allergies are a
// safety exclusion, not a preference the model can weigh against other
// goals, so a literal name match is caught here even if the prompt is
// ever ignored. A plain substring/word check can occasionally over-match
// (e.g. "milk" flags "coconut milk" for a dairy allergy, or "eggs" flags
// "eggplant") — acceptable since a false exclusion is far safer here than
// a false inclusion.
function matchedAllergen(foodName: string, allergies: string[]): string | null {
  const normalizedFood = foodName.toLowerCase();
  return (
    allergies.find((allergy) => {
      const term = allergy.toLowerCase().trim();
      if (!term) return false;
      return normalizedFood.includes(term) || normalizedFood.includes(singularize(term));
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

// Batch read for generateMealPlan's food loop: one query for every food's
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

export interface GenerateMealPlanResult {
  success: boolean;
  error: string | null;
  skippedFoods: string[];
  excludedForAllergy: string[];
}

function fail(error: string, excludedForAllergy: string[] = []): GenerateMealPlanResult {
  return { success: false, error, skippedFoods: [], excludedForAllergy };
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
    const allergen = matchedAllergen(food.food_name, context.profile.allergies);
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
    return fail("Couldn't save your meal plan. Please try again.", excludedForAllergy);
  }

  const preparations = safeFoods.map((food) => food.preparation ?? defaultPreparation(food.category));
  const searchKeys = safeFoods.map((food, i) => normalizeSearchKey(food.food_name, preparations[i]));
  const cachedMatches = await getCachedMatches(supabase, searchKeys);

  const skippedFoods: string[] = [];
  const rows: Array<Record<string, unknown>> = [];
  const newCacheRows = new Map<string, Record<string, unknown>>();
  let rateLimited = false;

  for (let i = 0; i < safeFoods.length; i++) {
    const food = safeFoods[i];
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
        meal_plan_id: newPlan.id,
        food_name: food.food_name,
        usda_fdc_id: match.fdcId,
        quantity_grams: match.quantityGrams,
        preparation,
        calories: match.calories,
        protein_g: match.proteinG,
        carbs_g: match.carbsG,
        fat_g: match.fatG,
        category: food.category,
        rationale: food.rationale,
        status: "proposed",
        is_user_added: false,
      });
    } catch (err) {
      if (err instanceof UsdaRateLimitError) {
        console.error(`[meal-plan ${user.id}] USDA rate limit hit — stopping lookups for this batch.`);
        rateLimited = true;
        skippedFoods.push(food.food_name);
        continue;
      }
      console.error(`[meal-plan ${user.id}] USDA lookup failed for "${food.food_name}":`, err);
      skippedFoods.push(food.food_name);
    }
  }

  if (newCacheRows.size > 0) {
    await supabase
      .from("food_reference")
      .upsert([...newCacheRows.values()], { onConflict: "search_key" });
  }

  if (rows.length > 0) {
    const { error: foodsError } = await supabase.from("meal_plan_foods").insert(rows);
    if (foodsError) {
      console.error(`[meal-plan ${user.id}] food rows insert failed:`, foodsError.message);
      return fail("Couldn't save your food list. Please try again.", excludedForAllergy);
    }
  }

  revalidatePath("/meal-plan");

  return { success: true, error: null, skippedFoods, excludedForAllergy };
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

  const allergen = matchedAllergen(foodName, profileRow?.allergies ?? []);
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
