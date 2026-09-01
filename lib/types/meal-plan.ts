export type MealPlanStatus = "draft" | "active" | "archived";
export type MealPlanFoodPreparation = "raw" | "cooked";
export type MealPlanFoodCategory = "protein" | "carb" | "vegetable" | "fruit" | "dairy" | "other";
export type MealPlanFoodStatus = "proposed" | "accepted" | "rejected";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type FoodPreferenceType = "excluded" | "preferred";

export const MEAL_PLAN_FOOD_CATEGORIES: MealPlanFoodCategory[] = [
  "protein",
  "carb",
  "vegetable",
  "fruit",
  "dairy",
  "other",
];

export const MEAL_PLAN_CATEGORY_LABELS: Record<MealPlanFoodCategory, string> = {
  protein: "Protein",
  carb: "Carbs",
  vegetable: "Vegetables",
  fruit: "Fruit",
  dairy: "Dairy",
  other: "Other",
};

export const MEAL_TYPE_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

export interface MealPlan {
  id: string;
  user_id: string;
  status: MealPlanStatus;
  ai_rationale: string | null;
  created_at: string;
}

export interface MealPlanFood {
  id: string;
  meal_plan_id: string;
  food_name: string;
  usda_fdc_id: string | null;
  quantity_grams: number | null;
  preparation: MealPlanFoodPreparation | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  category: MealPlanFoodCategory;
  meal_type: MealType;
  rationale: string | null;
  status: MealPlanFoodStatus;
  is_user_added: boolean;
  created_at: string;
}

export interface MealPlanWithFoods extends MealPlan {
  meal_plan_foods: MealPlanFood[];
}

export interface FoodPreference {
  id: string;
  user_id: string;
  food_name: string;
  usda_fdc_id: string | null;
  preference: FoodPreferenceType;
  created_at: string;
}
