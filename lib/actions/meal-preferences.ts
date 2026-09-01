"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  DIETARY_OPTIONS,
  GOAL_OPTIONS,
  ACTIVITY_LEVEL_OPTIONS,
  GOAL_INTENSITY_OPTIONS,
  INTENSITY_RELEVANT_GOALS,
} from "@/lib/meal-plan/preference-options";

export interface SaveMealPreferencesState {
  error: string | null;
}

const ACTIVITY_LEVEL_VALUES = ACTIVITY_LEVEL_OPTIONS.map((o) => o.value) as string[];
const GOAL_INTENSITY_VALUES = GOAL_INTENSITY_OPTIONS.map((o) => o.value) as string[];

export async function saveMealPreferences(
  _prevState: SaveMealPreferencesState,
  formData: FormData
): Promise<SaveMealPreferencesState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  const dietaryPreferences = formData.getAll("dietary_preferences") as string[];
  const allergies = (formData.getAll("allergies") as string[]).map((a) => a.trim()).filter(Boolean);
  const primaryGoal = formData.get("primary_goal") as string | null;
  const activityLevelRaw = (formData.get("activity_level") as string | null) || null;
  const goalIntensityRaw = (formData.get("goal_intensity") as string | null) || null;

  if (dietaryPreferences.length === 0 || !dietaryPreferences.every((d) => DIETARY_OPTIONS.includes(d as never))) {
    return { error: "Choose at least one dietary preference." };
  }

  if (!primaryGoal || !GOAL_OPTIONS.includes(primaryGoal as never)) {
    return { error: "Choose a primary goal." };
  }

  if (activityLevelRaw && !ACTIVITY_LEVEL_VALUES.includes(activityLevelRaw)) {
    return { error: "Invalid activity level." };
  }

  if (goalIntensityRaw && !GOAL_INTENSITY_VALUES.includes(goalIntensityRaw)) {
    return { error: "Invalid intensity." };
  }

  // Intensity only makes sense alongside the two goals it's shown for —
  // dropped server-side even if a stale value is submitted after the
  // user switches goals client-side.
  const goalIntensity = INTENSITY_RELEVANT_GOALS.has(primaryGoal) ? goalIntensityRaw : null;

  const { error } = await supabase
    .from("user_profiles")
    .update({
      dietary_preferences: dietaryPreferences,
      allergies,
      fitness_goals: [primaryGoal],
      activity_level: activityLevelRaw,
      goal_intensity: goalIntensity,
    })
    .eq("id", user.id);

  if (error) {
    console.error(`[meal-preferences ${user.id}] save failed:`, error.message);
    return { error: "Could not save your preferences. Please try again." };
  }

  revalidatePath("/meal-plan");
  revalidatePath("/settings");

  return { error: null };
}
