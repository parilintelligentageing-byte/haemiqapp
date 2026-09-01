"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FoodPreferenceType } from "@/lib/types/meal-plan";

// Persistent, cross-plan signal ("don't suggest this again" / "always
// suggest this") — separate from a single plan's accept/reject and from
// user_profiles.allergies (a hard safety block). Upserts on (user_id,
// food_name) so flipping a food from excluded to preferred (or back)
// just overwrites the existing row.
export async function setFoodPreference(
  foodName: string,
  usdaFdcId: string | null,
  preference: FoodPreferenceType
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  const { error } = await supabase.from("food_preferences").upsert(
    {
      user_id: user.id,
      food_name: foodName,
      usda_fdc_id: usdaFdcId,
      preference,
    },
    { onConflict: "user_id,food_name" }
  );

  if (error) {
    console.error(`[food-preferences ${user.id}] upsert failed:`, error.message);
    return { error: "Couldn't save that preference. Please try again." };
  }

  revalidatePath("/meal-plan");
  return { error: null };
}
