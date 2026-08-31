"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Gender } from "@/lib/types/user-profile";

const VALID_GENDERS: Gender[] = [
  "male",
  "female",
  "non-binary",
  "prefer_not_to_say",
];

export interface OnboardingState {
  error: string | null;
}

export async function completeOnboarding(
  _prevState: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const name = (formData.get("name") as string | null)?.trim();
  if (!name) {
    return { error: "Let us know what to call you." };
  }

  const age = Number(formData.get("age"));
  if (!Number.isInteger(age) || age < 13 || age > 120) {
    return { error: "Enter a valid age between 13 and 120." };
  }

  const gender = formData.get("gender") as string | null;
  if (!gender || !VALID_GENDERS.includes(gender as Gender)) {
    return { error: "Choose one of the options." };
  }

  const heightCm = Number(formData.get("height_cm"));
  if (!Number.isFinite(heightCm) || heightCm <= 0 || heightCm > 300) {
    return { error: "Enter a valid height in centimetres." };
  }

  const weightKg = Number(formData.get("weight_kg"));
  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 500) {
    return { error: "Enter a valid weight in kilograms." };
  }

  const { error } = await supabase.from("user_profiles").upsert({
    id: user.id,
    name,
    age,
    gender,
    height_cm: heightCm,
    weight_kg: weightKg,
    onboarding_completed: true,
  });

  if (error) {
    return { error: `Could not save your profile: ${error.message}` };
  }

  redirect("/dashboard");
}
