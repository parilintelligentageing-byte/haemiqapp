export type Gender = "male" | "female" | "non-binary" | "prefer_not_to_say";

export interface UserProfile {
  id: string;
  name: string | null;
  age: number | null;
  gender: Gender | null;
  height_cm: number | null;
  weight_kg: number | null;
  onboarding_completed: boolean;
  fitness_goals: string[] | null;
  dietary_preferences: string[] | null;
  activity_level: string | null;
  goal_intensity: string | null;
  health_conditions: string[] | null;
  allergies: string[] | null;
  created_at: string;
  updated_at: string;
}
