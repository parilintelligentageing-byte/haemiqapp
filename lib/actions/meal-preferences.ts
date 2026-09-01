"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DIETARY_OPTIONS, GOAL_OPTIONS } from "@/lib/meal-plan/preference-options";

export interface SaveMealPreferencesState {
  error: string | null;
}

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

  if (dietaryPreferences.length === 0 || !dietaryPreferences.every((d) => DIETARY_OPTIONS.includes(d as never))) {
    return { error: "Choose at least one dietary preference." };
  }

  if (!primaryGoal || !GOAL_OPTIONS.includes(primaryGoal as never)) {
    return { error: "Choose a primary goal." };
  }

  const { error } = await supabase
    .from("user_profiles")
    .update({
      dietary_preferences: dietaryPreferences,
      allergies,
      fitness_goals: [primaryGoal],
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
