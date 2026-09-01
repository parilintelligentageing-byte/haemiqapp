"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MealType } from "@/lib/types/meal-plan";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// Toggles today's logged state for one meal slot. The unique constraint
// on (user_id, meal_type, log_date) means there's at most one row per
// day per slot, so "logged" is just "does that row exist".
export async function toggleMealLogged(
  mealPlanId: string,
  mealType: MealType
): Promise<{ logged: boolean; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { logged: false, error: "Not authenticated." };
  }

  const logDate = todayDate();

  const { data: existing } = await supabase
    .from("meal_logs")
    .select("id")
    .eq("user_id", user.id)
    .eq("meal_type", mealType)
    .eq("log_date", logDate)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("meal_logs").delete().eq("id", existing.id);
    if (error) {
      console.error(`[meal-logs ${user.id}] delete failed:`, error.message);
      return { logged: true, error: "Couldn't update that. Please try again." };
    }
    revalidatePath("/meal-plan");
    return { logged: false, error: null };
  }

  const { error } = await supabase.from("meal_logs").insert({
    user_id: user.id,
    meal_plan_id: mealPlanId,
    meal_type: mealType,
    log_date: logDate,
  });

  if (error) {
    console.error(`[meal-logs ${user.id}] insert failed:`, error.message);
    return { logged: false, error: "Couldn't update that. Please try again." };
  }

  revalidatePath("/meal-plan");
  return { logged: true, error: null };
}

export async function getTodaysMealLogs(mealPlanId: string): Promise<MealType[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("meal_logs")
    .select("meal_type")
    .eq("user_id", user.id)
    .eq("meal_plan_id", mealPlanId)
    .eq("log_date", todayDate());

  if (error) {
    console.error(`[meal-logs ${user.id}] fetch failed:`, error.message);
    return [];
  }

  return (data ?? []).map((row) => row.meal_type as MealType);
}
